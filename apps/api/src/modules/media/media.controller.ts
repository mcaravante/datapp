import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/types';
import { MediaService, type UploadResult } from './media.service';

const ONE_DAY_SECONDS = 24 * 60 * 60;

/**
 * Two surfaces:
 *
 *   POST /v1/admin/media          (auth, multipart) — operator uploads
 *   GET  /media/:id/:filename     (public, no auth) — Resend / email
 *                                  clients fetch images by uuid v7
 *
 * The public GET intentionally has no auth so the email client (Gmail
 * proxy, Outlook, etc.) can render the image. Security comes from the
 * uuid v7 id being unguessable — same model as S3 pre-signed URLs.
 */
@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}
}

@Controller({ path: 'admin/media', version: '1' })
@UseGuards(JwtGuard)
@ApiBearerAuth()
@ApiTags('admin:media')
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB hard cap at multer level
      },
    }),
  )
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('Missing `file` part in the multipart body');
    }
    return this.media.upload({
      tenantId: this.tenantOrThrow(user),
      uploadedById: user.id,
      filename: file.originalname,
      mimeType: file.mimetype,
      bytes: file.buffer,
    });
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: UploadResult[] }> {
    return { data: await this.media.list(this.tenantOrThrow(user)) };
  }

  private tenantOrThrow(user: AuthenticatedUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException(
        'super_admin must impersonate a tenant for tenant-scoped endpoints',
      );
    }
    return user.tenantId;
  }
}

/**
 * Public path. NOT versioned (`/media/...` without `/v1/`) so the URL
 * doesn't break across API versions and stays embeddable in old emails
 * forever.
 */
@Controller('media')
@ApiTags('public:media')
export class PublicMediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':id/:filename')
  @Header('Cache-Control', `public, max-age=${ONE_DAY_SECONDS.toString()}, immutable`)
  async serve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    void filename; // informational only
    const asset = await this.media.findById(id);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Length', asset.bytes.length.toString());
    // Inline so email clients render directly; download filename mirrors
    // the stored name in case the user saves the image.
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asset.filename.replace(/"/g, '')}"`,
    );
    res.end(asset.bytes);
  }
}
