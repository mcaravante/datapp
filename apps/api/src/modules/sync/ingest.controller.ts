import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { IngestEnvelopeSchema, type IngestEnvelope } from '@datapp/shared/ingest';
import { HmacGuard } from './hmac.guard';
import { SyncService } from './sync.service';
import type { IngestRequest } from './types';

@Controller({ path: 'ingest/magento', version: '1' })
@ApiTags('ingest')
export class IngestController {
  constructor(private readonly syncService: SyncService) {}

  @Post('events')
  @UseGuards(HmacGuard)
  @Throttle({ default: { ttl: 60_000, limit: 600 } })
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(
    @Body(new ZodValidationPipe(IngestEnvelopeSchema)) envelope: IngestEnvelope,
    @Req() req: IngestRequest,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    return this.syncService.ingest(req.ingest, envelope, rawBody);
  }
}
