import { Module } from '@nestjs/common';
import { AdminMediaController, PublicMediaController } from './media.controller';
import { MediaService } from './media.service';

/**
 * Operator-uploaded image assets for email templates. See `MediaAsset`
 * Prisma model + ADR 0007 (Phase 3 vertical).
 */
@Module({
  controllers: [AdminMediaController, PublicMediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
