import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, TenantEmailBranding } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import type { Env } from '../../config/env';

export interface BrandingDto {
  tenant_id: string;
  logo_media_asset_id: string | null;
  logo_url: string | null;
  logo_max_width_px: number;
  primary_color: string | null;
  footer_html: string | null;
  sender_name: string | null;
  sender_address: string | null;
  unsubscribe_text: string;
  updated_at: string;
}

export interface UpdateBrandingInput {
  logoMediaAssetId?: string | null;
  logoMaxWidthPx?: number;
  primaryColor?: string | null;
  footerHtml?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  unsubscribeText?: string;
}

/**
 * Resolved branding shaped for the email composer. Logo URL is
 * pre-resolved to its public `/media/...` href so the composer doesn't
 * need to know about the MediaAsset table.
 */
export interface ResolvedBranding {
  logoUrl: string | null;
  logoMaxWidthPx: number;
  primaryColor: string | null;
  footerHtml: string | null;
  senderName: string | null;
  senderAddress: string | null;
  unsubscribeText: string;
}

@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);
  private readonly publicBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.publicBaseUrl = config.get('APP_URL_API', { infer: true }).replace(/\/+$/, '');
  }

  async getDto(tenantId: string): Promise<BrandingDto> {
    const row = await this.prisma.tenantEmailBranding.findUnique({
      where: { tenantId },
      include: { logoAsset: true },
    });
    if (!row) {
      // Return a default shape so admin UI can render even on first visit.
      return {
        tenant_id: tenantId,
        logo_media_asset_id: null,
        logo_url: null,
        logo_max_width_px: 180,
        primary_color: null,
        footer_html: null,
        sender_name: null,
        sender_address: null,
        unsubscribe_text:
          'Si no querés recibir más estos emails, podés desuscribirte acá.',
        updated_at: new Date(0).toISOString(),
      };
    }
    return {
      tenant_id: row.tenantId,
      logo_media_asset_id: row.logoMediaAssetId,
      logo_url: row.logoAsset
        ? `${this.publicBaseUrl}/media/${row.logoAsset.id}/${encodeURIComponent(row.logoAsset.filename)}`
        : null,
      logo_max_width_px: row.logoMaxWidthPx,
      primary_color: row.primaryColor,
      footer_html: row.footerHtml,
      sender_name: row.senderName,
      sender_address: row.senderAddress,
      unsubscribe_text: row.unsubscribeText,
      updated_at: row.updatedAt.toISOString(),
    };
  }

  /** Upsert because the row is 1:1 with tenant. */
  async update(tenantId: string, input: UpdateBrandingInput): Promise<BrandingDto> {
    if (input.logoMediaAssetId) {
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: input.logoMediaAssetId },
        select: { tenantId: true },
      });
      if (!asset || asset.tenantId !== tenantId) {
        throw new NotFoundException(`MediaAsset ${input.logoMediaAssetId} not found in tenant`);
      }
    }

    const data: Prisma.TenantEmailBrandingUpsertArgs['create'] = {
      tenantId,
      ...(input.logoMediaAssetId !== undefined ? { logoMediaAssetId: input.logoMediaAssetId } : {}),
      ...(input.logoMaxWidthPx !== undefined ? { logoMaxWidthPx: input.logoMaxWidthPx } : {}),
      ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
      ...(input.footerHtml !== undefined ? { footerHtml: input.footerHtml } : {}),
      ...(input.senderName !== undefined ? { senderName: input.senderName } : {}),
      ...(input.senderAddress !== undefined ? { senderAddress: input.senderAddress } : {}),
      ...(input.unsubscribeText !== undefined ? { unsubscribeText: input.unsubscribeText } : {}),
    };

    await this.prisma.tenantEmailBranding.upsert({
      where: { tenantId },
      create: data,
      update: data,
    });

    return this.getDto(tenantId);
  }

  /**
   * Branding shape used by `EmailService.dispatchSend` at render time.
   * Returns null if the tenant has no row yet (composer falls back to
   * a no-branding shell).
   */
  async resolveForCompose(tenantId: string): Promise<ResolvedBranding | null> {
    const row = await this.prisma.tenantEmailBranding.findUnique({
      where: { tenantId },
      include: { logoAsset: true },
    });
    if (!row) return null;
    return {
      logoUrl: row.logoAsset
        ? `${this.publicBaseUrl}/media/${row.logoAsset.id}/${encodeURIComponent(row.logoAsset.filename)}`
        : null,
      logoMaxWidthPx: row.logoMaxWidthPx,
      primaryColor: row.primaryColor,
      footerHtml: row.footerHtml,
      senderName: row.senderName,
      senderAddress: row.senderAddress,
      unsubscribeText: row.unsubscribeText,
    };
  }

  /** Helper for the public unsubscribe controller — looks up display info. */
  async findContactInfo(
    tenantId: string,
  ): Promise<Pick<TenantEmailBranding, 'senderName' | 'senderAddress'> | null> {
    const row = await this.prisma.tenantEmailBranding.findUnique({
      where: { tenantId },
      select: { senderName: true, senderAddress: true },
    });
    return row;
  }
}
