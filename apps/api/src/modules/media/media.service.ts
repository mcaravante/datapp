import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MediaAsset } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import type { Env } from '../../config/env';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — generous for email images.

export interface UploadResult {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  /** Public URL operators can paste into <img> tags. */
  url: string;
  created_at: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly publicBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.publicBaseUrl = config.get('APP_URL_API', { infer: true }).replace(/\/+$/, '');
  }

  async upload(args: {
    tenantId: string;
    uploadedById: string | null;
    filename: string;
    mimeType: string;
    bytes: Buffer;
  }): Promise<UploadResult> {
    if (!ALLOWED_MIME_TYPES.has(args.mimeType.toLowerCase())) {
      throw new UnsupportedMediaTypeException(
        `Mime ${args.mimeType} not allowed; use PNG / JPEG / WEBP / GIF`,
      );
    }
    if (args.bytes.length === 0) {
      throw new BadRequestException('Empty file');
    }
    if (args.bytes.length > MAX_BYTES) {
      throw new PayloadTooLargeException(
        `File exceeds ${(MAX_BYTES / (1024 * 1024)).toFixed(0)} MB limit`,
      );
    }

    const sanitized = this.sanitizeFilename(args.filename);
    const row = await this.prisma.mediaAsset.create({
      data: {
        tenantId: args.tenantId,
        uploadedById: args.uploadedById,
        filename: sanitized,
        mimeType: args.mimeType.toLowerCase(),
        sizeBytes: args.bytes.length,
        bytes: args.bytes,
      },
      select: this.summarySelect,
    });

    this.logger.log(
      `Uploaded media ${row.id} (${row.filename}, ${row.sizeBytes} bytes, ${row.mimeType}) tenant=${args.tenantId}`,
    );
    return this.toResult(row);
  }

  async findById(id: string): Promise<{
    id: string;
    filename: string;
    mimeType: string;
    bytes: Buffer;
    createdAt: Date;
  }> {
    const row = await this.prisma.mediaAsset.findUnique({
      where: { id },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        bytes: true,
        createdAt: true,
      },
    });
    if (!row) {
      throw new NotFoundException(`Media ${id} not found`);
    }
    return {
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      bytes: Buffer.from(row.bytes),
      createdAt: row.createdAt,
    };
  }

  async list(tenantId: string, limit = 50): Promise<UploadResult[]> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit), 200),
      select: this.summarySelect,
    });
    return rows.map(this.toResult);
  }

  /**
   * Strip path components and weird characters; keep alphanumeric, dot,
   * dash, underscore, and a small set of safe Unicode. Falls back to a
   * generic name if the cleanup leaves nothing.
   */
  private sanitizeFilename(raw: string): string {
    const base = raw.split(/[\\/]/).pop() ?? raw;
    const cleaned = base.replace(/[^\w.\- ]+/g, '').trim();
    if (cleaned === '' || cleaned === '.' || cleaned === '..') {
      return 'image';
    }
    // Limit length to keep URLs sane.
    return cleaned.slice(0, 120);
  }

  private get summarySelect() {
    return {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    } as const;
  }

  private toResult = (
    row: Pick<MediaAsset, 'id' | 'filename' | 'mimeType' | 'sizeBytes' | 'createdAt'>,
  ): UploadResult => ({
    id: row.id,
    filename: row.filename,
    mime_type: row.mimeType,
    size_bytes: row.sizeBytes,
    url: `${this.publicBaseUrl}/media/${row.id}/${encodeURIComponent(row.filename)}`,
    created_at: row.createdAt.toISOString(),
  });
}
