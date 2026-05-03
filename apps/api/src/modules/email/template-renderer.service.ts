import { Injectable, Logger } from '@nestjs/common';
import Handlebars from 'handlebars';
import mjml2html from 'mjml';
import type { EmailTemplate } from '@datapp/db';

/**
 * Render-time error. Surfaced to the dispatcher so it can persist the
 * detail on `EmailSend.errorMessage` and fail the send cleanly. The
 * dispatcher treats this as a non-retryable failure.
 */
export class TemplateRenderError extends Error {
  override readonly name = 'TemplateRenderError';
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text?: string;
}

/**
 * Compiles and caches Handlebars templates, optionally first running the
 * body through MJML when `template.format === 'mjml'`. The compile step
 * is the slow one (parses MJML / Handlebars AST), so we cache by
 * `(templateId, updatedAt.getTime())` — invalidating naturally whenever
 * the operator saves a template.
 *
 * Variables passed to `render()` are validated against the template's
 * `variables` JSON-Schema so a missing field produces a clean
 * `TemplateRenderError` instead of a half-rendered email with `{{ name }}`
 * literals leaking through.
 *
 * Output HTML preserves Handlebars' default escaping. We do NOT register
 * any helpers that bypass escaping for user-derived data (no triple-stash
 * `{{{...}}}` allowed in templates that interpolate names / cart items).
 */
@Injectable()
export class TemplateRendererService {
  private readonly logger = new Logger(TemplateRendererService.name);
  private readonly cache = new Map<
    string,
    { subject: HandlebarsTemplateDelegate; html: HandlebarsTemplateDelegate; text?: HandlebarsTemplateDelegate }
  >();

  async render(template: EmailTemplate, variables: Record<string, unknown>): Promise<RenderedEmail> {
    this.validateVariables(template, variables);
    const compiled = await this.getCompiled(template);
    try {
      const subject = compiled.subject(variables);
      const html = compiled.html(variables);
      const text = compiled.text?.(variables);
      return text ? { subject, html, text } : { subject, html };
    } catch (err) {
      throw new TemplateRenderError(
        `Failed to render template ${template.slug}: ${(err as Error).message}`,
      );
    }
  }

  private async getCompiled(template: EmailTemplate) {
    const key = `${template.id}:${template.updatedAt.getTime().toString()}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const subjectFn = this.compileHandlebars(template.subject, `${template.slug}#subject`);

    let bodySource = template.bodyHtml;
    if (template.format === 'mjml') {
      // mjml v5 returns a Promise — must await.
      const result = await mjml2html(template.bodyHtml, { validationLevel: 'strict' });
      if (result.errors.length > 0) {
        throw new TemplateRenderError(
          `MJML errors in template ${template.slug}: ${result.errors.map((e) => e.message).join('; ')}`,
        );
      }
      bodySource = result.html;
    } else if (template.format !== 'html') {
      throw new TemplateRenderError(
        `Unknown template format "${template.format}" on ${template.slug} (expected mjml | html)`,
      );
    }

    const htmlFn = this.compileHandlebars(bodySource, `${template.slug}#html`);
    const textFn = template.bodyText
      ? this.compileHandlebars(template.bodyText, `${template.slug}#text`)
      : undefined;

    const compiled = textFn
      ? { subject: subjectFn, html: htmlFn, text: textFn }
      : { subject: subjectFn, html: htmlFn };
    this.cache.set(key, compiled);
    this.logger.debug(`Compiled template ${template.slug} (cache miss, key=${key})`);
    return compiled;
  }

  private compileHandlebars(source: string, label: string): HandlebarsTemplateDelegate {
    try {
      // `strict: true` makes missing variables throw at render time
      // instead of silently producing the empty string. Combined with
      // `validateVariables`, this gives us a two-layer safety net.
      return Handlebars.compile(source, { strict: true, noEscape: false });
    } catch (err) {
      throw new TemplateRenderError(
        `Handlebars parse error in ${label}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Minimal JSON-Schema-shaped validator: we only enforce the `required`
   * array of property names. Full JSON-Schema validation is left to a
   * future iteration; for the abandoned-cart vertical the variable set
   * is small and known.
   */
  private validateVariables(template: EmailTemplate, variables: Record<string, unknown>): void {
    const schema = template.variables as { required?: string[] } | null | undefined;
    const required = schema?.required ?? [];
    const missing = required.filter((key) => variables[key] === undefined || variables[key] === null);
    if (missing.length > 0) {
      throw new TemplateRenderError(
        `Template ${template.slug} requires variables [${missing.join(', ')}] which were not provided`,
      );
    }
  }
}
