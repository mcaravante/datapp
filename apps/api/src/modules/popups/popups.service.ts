import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@datapp/db';
import type { Form } from '@datapp/db';
import { PrismaService } from '../../db/prisma.service';
import type {
  CreatePopupBody,
  LoaderPopup,
  PageMatchRuleSchema,
  PopupDetail,
  PopupSubmissionIngestBody,
  PopupSummary,
  SubmissionsPage,
  UpdatePopupBody,
} from './dto/popups.dto';
import type { z } from 'zod';

type PageMatchRule = z.infer<typeof PageMatchRuleSchema>;

interface RecordSubmissionResult {
  status: 'ok' | 'rate_limited' | 'origin_denied' | 'honeypot' | 'unknown_form';
  formId?: string;
  submissionId?: string;
}

@Injectable()
export class PopupsService {
  private readonly logger = new Logger(PopupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ---------- Admin CRUD ---------- */

  async listForTenant(tenantId: string): Promise<PopupSummary[]> {
    const rows = await this.prisma.form.findMany({
      where: { tenantId },
      orderBy: [{ status: 'asc' }, { displayPriority: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((r) => this.toSummary(r));
  }

  async findById(tenantId: string, id: string): Promise<PopupDetail> {
    const row = await this.prisma.form.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`Popup ${id} not found`);
    return this.toDetail(row);
  }

  async create(tenantId: string, body: CreatePopupBody): Promise<PopupDetail> {
    try {
      const row = await this.prisma.form.create({
        data: this.bodyToCreateData(tenantId, body),
      });
      this.logger.log(`Created popup ${row.slug} (${row.id}) for tenant ${tenantId}`);
      return this.toDetail(row);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          `Popup with slug or name "${body.slug ?? body.name}" already exists`,
        );
      }
      throw err;
    }
  }

  async update(
    tenantId: string,
    id: string,
    body: UpdatePopupBody,
  ): Promise<PopupDetail> {
    const existing = await this.prisma.form.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Popup ${id} not found`);
    const data = this.bodyToUpdateData(body);
    if (Object.keys(data).length === 0) return this.toDetail(existing);
    const row = await this.prisma.form.update({ where: { id }, data });
    return this.toDetail(row);
  }

  async archive(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.form.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Popup ${id} not found`);
    await this.prisma.form.update({
      where: { id },
      data: { status: 'archived', isActive: false },
    });
  }

  async listSubmissions(
    tenantId: string,
    page: number,
    limit: number,
    formId?: string,
  ): Promise<SubmissionsPage> {
    const where: Prisma.FormSubmissionWhereInput = { tenantId };
    if (formId) where.formId = formId;
    const [rows, totalCount] = await Promise.all([
      this.prisma.formSubmission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { form: { select: { slug: true, name: true } } },
      }),
      this.prisma.formSubmission.count({ where }),
    ]);
    return {
      page,
      limit,
      total_count: totalCount,
      total_pages: Math.max(1, Math.ceil(totalCount / limit)),
      data: rows.map((r) => ({
        id: r.id,
        form_id: r.formId,
        form_slug: r.form.slug,
        form_name: r.form.name,
        email: r.email,
        page_url: r.pageUrl,
        payload: r.payload as Record<string, unknown>,
        submitted_at: r.submittedAt.toISOString(),
      })),
    };
  }

  /* ---------- Public loader ---------- */

  /**
   * Returns the popups the loader should render on `pagePath` for a
   * tenant identified by slug, AFTER verifying that the request origin
   * is in the tenant's allowlist. Origin enforcement here (not in a
   * guard) lets us serve a 200 with an empty array on a denied origin
   * — we don't want to leak which tenants exist.
   */
  async listForLoader(args: {
    tenantSlug: string;
    pagePath: string;
    origin: string | undefined;
  }): Promise<{ popups: LoaderPopup[] }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: args.tenantSlug },
      select: { id: true, allowedOrigins: true },
    });
    if (!tenant) return { popups: [] };
    if (!this.originAllowed(args.origin, tenant.allowedOrigins)) {
      this.logger.warn(
        `Loader origin denied tenant=${args.tenantSlug} origin=${args.origin ?? '<missing>'}`,
      );
      return { popups: [] };
    }

    const rows = await this.prisma.form.findMany({
      where: { tenantId: tenant.id, status: 'active', isActive: true },
      orderBy: [{ displayPriority: 'desc' }, { updatedAt: 'desc' }],
    });

    const matched = rows.filter((r) => this.pathMatches(args.pagePath, r.pageMatchRules));
    return {
      popups: matched.map((r) => this.toLoader(r)),
    };
  }

  /**
   * Records a popup submission. Origin-checked against the tenant
   * allowlist; rate-limit + dedup live in the controller (Throttler +
   * idempotency by `(tenantId, formId, emailHash, day)`). Returns a
   * machine-readable status so the loader can show a clean message.
   */
  async recordSubmission(args: {
    tenantSlug: string;
    body: PopupSubmissionIngestBody;
    origin: string | undefined;
    userAgent: string | undefined;
    ipAddress: string | undefined;
  }): Promise<RecordSubmissionResult> {
    if (args.body.honeypot && args.body.honeypot.trim().length > 0) {
      // Bot — silently accept and drop, so the bot can't probe.
      return { status: 'honeypot' };
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: args.tenantSlug },
      select: { id: true, allowedOrigins: true },
    });
    if (!tenant) return { status: 'origin_denied' };
    if (!this.originAllowed(args.origin, tenant.allowedOrigins)) {
      this.logger.warn(
        `Submission origin denied tenant=${args.tenantSlug} origin=${args.origin ?? '<missing>'}`,
      );
      return { status: 'origin_denied' };
    }

    const form = await this.prisma.form.findFirst({
      where: { tenantId: tenant.id, slug: args.body.formSlug, isActive: true },
    });
    if (!form) return { status: 'unknown_form' };
    if (form.status !== 'active') return { status: 'unknown_form' };

    // Visitor row — get-or-create by (tenantId, anonymousId). The
    // loader generates the id once and reuses it across pages.
    const visitor = await this.prisma.visitor.upsert({
      where: {
        tenantId_anonymousId: {
          tenantId: tenant.id,
          anonymousId: args.body.anonymousId,
        },
      },
      create: {
        tenantId: tenant.id,
        anonymousId: args.body.anonymousId,
        lastSeenAt: new Date(),
      },
      update: { lastSeenAt: new Date() },
      select: { id: true },
    });

    const lcEmail = args.body.email.trim().toLowerCase();
    const emailHash = createHash('sha256').update(lcEmail).digest('hex');

    // Resolve to a CustomerProfile if one already exists for this
    // tenant + email; otherwise create a thin one. The Phase 2.2
    // identity-stitching path will fold visitor → customer once the
    // visitor logs into Magento.
    let customerProfileId: string | null = null;
    const existingCustomer = await this.prisma.customerProfile.findFirst({
      where: { tenantId: tenant.id, emailHash },
      select: { id: true },
    });
    if (existingCustomer) {
      customerProfileId = existingCustomer.id;
    } else {
      const created = await this.prisma.customerProfile.create({
        data: {
          tenantId: tenant.id,
          email: lcEmail,
          emailHash,
          // No magentoCustomerId yet — they'll get one if/when they
          // sign up at the storefront. Until then this is a popup-only
          // lead.
          subscriptionStatus: 'subscribed',
          isSubscribed: true,
          subscriptionConsentAt: new Date(),
          subscriptionConsentSource: `popup:${form.slug}`,
        },
        select: { id: true },
      });
      customerProfileId = created.id;
    }

    // Audit row — every attempt persists, even if the same email
    // submits twice in 30 seconds. The unique semantics live one
    // level up at `Subscription`.
    const submission = await this.prisma.formSubmission.create({
      data: {
        tenantId: tenant.id,
        formId: form.id,
        visitorId: visitor.id,
        customerProfileId,
        email: lcEmail,
        emailHash,
        pageUrl: args.body.pageUrl,
        userAgent: args.userAgent ?? null,
        ipAddress: args.ipAddress ?? null,
        payload: args.body.extra as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    // Subscription row (one per (customerProfileId, listId) — the form
    // optionally points at a marketing list).
    if (form.marketingListId && customerProfileId) {
      await this.prisma.subscription.upsert({
        where: {
          customerProfileId_listId: {
            customerProfileId,
            listId: form.marketingListId,
          },
        },
        create: {
          tenantId: tenant.id,
          customerProfileId,
          listId: form.marketingListId,
          status: 'subscribed',
          consentAt: new Date(),
          consentSource: `popup:${form.slug}`,
          consentIp: args.ipAddress ?? null,
        },
        update: {
          status: 'subscribed',
          unsubscribedAt: null,
          consentAt: new Date(),
          consentSource: `popup:${form.slug}`,
          consentIp: args.ipAddress ?? null,
        },
      });
    }

    // Bump the cached counter so the admin list shows fresh numbers
    // without an aggregate query. Best-effort — counter drift between
    // this and the actual count is acceptable.
    await this.prisma.form.update({
      where: { id: form.id },
      data: {
        cachedSubmissionCount: { increment: 1 },
        cachedLastSubmittedAt: new Date(),
      },
    });

    this.logger.log(
      `Popup submission tenant=${args.tenantSlug} form=${form.slug} customer=${customerProfileId}`,
    );
    return { status: 'ok', formId: form.id, submissionId: submission.id };
  }

  /* ---------- helpers ---------- */

  private originAllowed(
    origin: string | undefined,
    allowed: string[],
  ): boolean {
    if (allowed.length === 0) return false;
    if (!origin) return false;
    return allowed.some((a) => a.toLowerCase() === origin.toLowerCase());
  }

  /**
   * Single source of truth for "does this URL path match this rule"
   * — applied client-side by the loader for instant evaluation AND
   * server-side for the API response, so the two don't drift.
   */
  private pathMatches(pagePath: string, rules: unknown): boolean {
    if (!Array.isArray(rules) || rules.length === 0) return true;
    return rules.some((raw) => {
      if (typeof raw !== 'object' || raw === null) return false;
      const rule = raw as { kind?: string; value?: string };
      const value = typeof rule.value === 'string' ? rule.value : '';
      switch (rule.kind) {
        case 'equals':
          return pagePath === value;
        case 'starts_with':
          return pagePath.startsWith(value);
        case 'regex':
          try {
            return new RegExp(value).test(pagePath);
          } catch {
            return false;
          }
        default:
          return false;
      }
    });
  }

  private bodyToCreateData(
    tenantId: string,
    body: CreatePopupBody,
  ): Prisma.FormUncheckedCreateInput {
    return {
      tenantId,
      slug: body.slug,
      name: body.name,
      kind: body.kind,
      status: body.status,
      headline: body.headline ?? null,
      subheadline: body.subheadline ?? null,
      bodyHtml: body.bodyHtml ?? null,
      imageUrl: body.imageUrl ?? null,
      primaryCtaLabel: body.primaryCtaLabel ?? null,
      primaryColor: body.primaryColor ?? null,
      consentText: body.consentText ?? null,
      successMessage: body.successMessage ?? null,
      fields: body.fields as Prisma.InputJsonValue,
      trigger: body.trigger,
      triggerDelaySeconds: body.triggerDelaySeconds,
      displayFrequency: body.displayFrequency,
      pageMatchRules: body.pageMatchRules as Prisma.InputJsonValue,
      displayPriority: body.displayPriority,
      showCap: body.showCap ?? null,
      submissionCap: body.submissionCap ?? null,
      marketingListId: body.marketingListId ?? null,
      isActive: body.status === 'active',
    };
  }

  private bodyToUpdateData(body: UpdatePopupBody): Prisma.FormUncheckedUpdateInput {
    const data: Prisma.FormUncheckedUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.kind !== undefined) data.kind = body.kind;
    if (body.status !== undefined) {
      data.status = body.status;
      data.isActive = body.status === 'active';
    }
    if (body.headline !== undefined) data.headline = body.headline ?? null;
    if (body.subheadline !== undefined) data.subheadline = body.subheadline ?? null;
    if (body.bodyHtml !== undefined) data.bodyHtml = body.bodyHtml ?? null;
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl ?? null;
    if (body.primaryCtaLabel !== undefined) data.primaryCtaLabel = body.primaryCtaLabel ?? null;
    if (body.primaryColor !== undefined) data.primaryColor = body.primaryColor ?? null;
    if (body.consentText !== undefined) data.consentText = body.consentText ?? null;
    if (body.successMessage !== undefined) data.successMessage = body.successMessage ?? null;
    if (body.fields !== undefined) data.fields = body.fields as Prisma.InputJsonValue;
    if (body.trigger !== undefined) data.trigger = body.trigger;
    if (body.triggerDelaySeconds !== undefined) data.triggerDelaySeconds = body.triggerDelaySeconds;
    if (body.displayFrequency !== undefined) data.displayFrequency = body.displayFrequency;
    if (body.pageMatchRules !== undefined) {
      data.pageMatchRules = body.pageMatchRules as Prisma.InputJsonValue;
    }
    if (body.displayPriority !== undefined) data.displayPriority = body.displayPriority;
    if (body.showCap !== undefined) data.showCap = body.showCap ?? null;
    if (body.submissionCap !== undefined) data.submissionCap = body.submissionCap ?? null;
    if (body.marketingListId !== undefined) {
      data.marketingListId = body.marketingListId ?? null;
    }
    return data;
  }

  private toSummary(row: Form): PopupSummary {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      status: row.status,
      trigger: row.trigger,
      trigger_delay_seconds: row.triggerDelaySeconds,
      display_frequency: row.displayFrequency,
      display_priority: row.displayPriority,
      page_match_rules: this.parseRules(row.pageMatchRules),
      show_count: row.cachedShowCount,
      submission_count: row.cachedSubmissionCount,
      last_submitted_at: row.cachedLastSubmittedAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: Form): PopupDetail {
    return {
      ...this.toSummary(row),
      headline: row.headline,
      subheadline: row.subheadline,
      body_html: row.bodyHtml,
      image_url: row.imageUrl,
      primary_cta_label: row.primaryCtaLabel,
      primary_color: row.primaryColor,
      consent_text: row.consentText,
      success_message: row.successMessage,
      fields: this.parseFields(row.fields),
      show_cap: row.showCap,
      submission_cap: row.submissionCap,
      marketing_list_id: row.marketingListId,
    };
  }

  private toLoader(row: Form): LoaderPopup {
    return {
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      trigger: row.trigger,
      trigger_delay_seconds: row.triggerDelaySeconds,
      display_frequency: row.displayFrequency,
      display_priority: row.displayPriority,
      headline: row.headline,
      subheadline: row.subheadline,
      body_html: row.bodyHtml,
      image_url: row.imageUrl,
      primary_cta_label: row.primaryCtaLabel,
      primary_color: row.primaryColor,
      consent_text: row.consentText,
      success_message: row.successMessage,
      fields: this.parseFields(row.fields),
    };
  }

  private parseRules(raw: unknown): PageMatchRule[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is { kind: string; value: string } =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as { kind?: unknown }).kind === 'string' &&
        typeof (r as { value?: unknown }).value === 'string',
      )
      .filter((r): r is PageMatchRule =>
        r.kind === 'equals' || r.kind === 'starts_with' || r.kind === 'regex',
      );
  }

  private parseFields(raw: unknown): PopupDetail['fields'] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((f): PopupDetail['fields'] => {
      if (typeof f !== 'object' || f === null) return [];
      const o = f as Record<string, unknown>;
      if (
        typeof o.name !== 'string' ||
        typeof o.label !== 'string' ||
        typeof o.type !== 'string'
      ) {
        return [];
      }
      const placeholder =
        typeof o.placeholder === 'string' ? { placeholder: o.placeholder } : {};
      return [
        {
          name: o.name,
          label: o.label,
          type: o.type,
          required: o.required !== false,
          ...placeholder,
        },
      ];
    });
  }
}
