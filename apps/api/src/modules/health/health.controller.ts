import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { PrismaService } from '../../db/prisma.service';
import { AUTH_REDIS } from '../auth/auth.tokens';

interface ReadyDetail {
  status: 'ok' | 'fail';
  latency_ms?: number;
  error?: string;
}

interface ReadyResponse {
  status: 'ok' | 'fail';
  timestamp: string;
  checks: {
    postgres: ReadyDetail;
    redis: ReadyDetail;
  };
}

@Controller({ path: 'health', version: '1' })
@ApiTags('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Liveness probe — "is the Node process responsive?". Used by Docker
   * HEALTHCHECK and as a sanity ping. Doesn't touch dependencies, so a
   * green liveness can co-exist with a red readiness during incidents.
   */
  @Get('live')
  live(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness probe — "is this instance fit to receive traffic?".
   * Pings Postgres and Redis with a tight timeout. Returns 503 when
   * any dependency is unreachable so a load balancer / Dokploy can
   * stop routing requests during a partial outage.
   */
  @Get('ready')
  async ready(): Promise<ReadyResponse> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    const overall: 'ok' | 'fail' =
      postgres.status === 'ok' && redis.status === 'ok' ? 'ok' : 'fail';
    const body: ReadyResponse = {
      status: overall,
      timestamp: new Date().toISOString(),
      checks: { postgres, redis },
    };
    if (overall === 'fail') {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  /** Backwards-compat alias kept for existing integrations. */
  @Get()
  legacy(): { status: 'ok'; timestamp: string } {
    return this.live();
  }

  private async checkPostgres(): Promise<ReadyDetail> {
    const started = Date.now();
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        timeout(2_000, 'postgres ping timed out'),
      ]);
      return { status: 'ok', latency_ms: Date.now() - started };
    } catch (err) {
      return { status: 'fail', error: err instanceof Error ? err.message : 'unknown' };
    }
  }

  private async checkRedis(): Promise<ReadyDetail> {
    const started = Date.now();
    try {
      await Promise.race([this.redis.ping(), timeout(2_000, 'redis ping timed out')]);
      return { status: 'ok', latency_ms: Date.now() - started };
    } catch (err) {
      return { status: 'fail', error: err instanceof Error ? err.message : 'unknown' };
    }
  }
}

function timeout(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    const t = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (t as { unref?: () => void }).unref?.();
  });
}
