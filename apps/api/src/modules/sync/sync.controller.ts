import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../../db/prisma.service';

@Controller({ path: 'admin/sync', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:sync')
export class SyncStatusController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Snapshot of every (store × entity) sync state row for the active
   * tenant. Iteration 4 will enrich this with BullMQ queue depth and a
   * trailing window of `sync_event_log` errors.
   */
  @Get('status')
  async status(@CurrentUser() user: AuthenticatedUser) {
    if (!user.tenantId) {
      throw new ForbiddenException('super_admin must impersonate a tenant');
    }
    const rows = await this.prisma.syncState.findMany({
      where: { tenantId: user.tenantId },
      include: { magentoStore: { select: { name: true } } },
      orderBy: [{ entity: 'asc' }],
    });

    return {
      data: rows.map((r) => ({
        entity: r.entity,
        store: r.magentoStore.name,
        status: r.status,
        last_processed_at: r.lastProcessedAt?.toISOString() ?? null,
        cursor: r.cursor,
        last_error: r.lastError,
        updated_at: r.updatedAt.toISOString(),
      })),
    };
  }
}
