import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PopupsService } from './popups.service';
import {
  PopupSubmissionIngestSchema,
  type LoaderPopup,
  type PopupSubmissionIngestBody,
} from './dto/popups.dto';

const ListQuerySchema = z.object({
  tenant_slug: z.string().min(1).max(80),
  path: z.string().min(1).max(2000).default('/'),
});
type ListQuery = z.infer<typeof ListQuerySchema>;

const SubmissionQuerySchema = z.object({
  tenant_slug: z.string().min(1).max(80),
});
type SubmissionQuery = z.infer<typeof SubmissionQuerySchema>;

/**
 * Endpoints fetched by the public storefront loader script. NOT
 * versioned (`VERSION_NEUTRAL`) for the same reason `/media/...` isn't
 * — these URLs are pasted into Magento's layout XML by the operator
 * and we don't want to invalidate them when the API version bumps.
 *
 * Auth: there is none in the bearer-token sense; instead, every call
 * verifies that `req.headers.origin` is in the tenant's
 * `allowed_origins` allowlist. The check happens inside the service so
 * a denied origin returns a benign empty response (don't leak which
 * tenants exist).
 */
@Controller({ path: '', version: VERSION_NEUTRAL })
@ApiTags('public:popups')
export class PublicPopupsController {
  constructor(private readonly popups: PopupsService) {}

  /**
   * The loader hits this on page load with `?tenant_slug=…&path=…`.
   * Cached weakly so a fresh popup edit shows up on the next visit
   * without the operator having to touch anything.
   */
  @Get('public/popups')
  @Header('Cache-Control', 'public, max-age=30')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  // No tenant secret in this URL → we cap the rate per IP/origin so an
  // attacker can't DoS the popup table walk.
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async list(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQuery,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ popups: LoaderPopup[] }> {
    return this.popups.listForLoader({
      tenantSlug: query.tenant_slug,
      pagePath: query.path,
      origin,
    });
  }

  /**
   * Form submission from the loader. `Throttle` caps abuse, the
   * service-level honeypot+origin check stops the rest. Always returns
   * 200 with a status string so the loader doesn't infer tenant
   * existence from response codes.
   */
  @Post('ingest/popup-submission')
  @HttpCode(HttpStatus.OK)
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async ingest(
    @Query(new ZodValidationPipe(SubmissionQuerySchema)) query: SubmissionQuery,
    @Body(new ZodValidationPipe(PopupSubmissionIngestSchema))
    body: PopupSubmissionIngestBody,
    @Headers('origin') origin: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ): Promise<{ status: 'ok' | 'rate_limited' | 'origin_denied' | 'honeypot' | 'unknown_form' }> {
    void req;
    const result = await this.popups.recordSubmission({
      tenantSlug: query.tenant_slug,
      body,
      origin,
      userAgent,
      ipAddress: ip,
    });
    return { status: result.status };
  }
}
