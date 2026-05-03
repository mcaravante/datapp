import { describe, it, expect } from 'vitest';
import { TemplateRendererService, TemplateRenderError } from './template-renderer.service';
import type { EmailTemplate } from '@datapp/db';

function makeTemplate(overrides: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    tenantId: '01900000-0000-7000-8000-00000000aaaa',
    channel: 'abandoned_cart',
    slug: 'test',
    name: 'Test',
    subject: 'Hola {{customer.firstName}}, te dejaste el carrito 🛒',
    bodyHtml: '<p>Tu carrito tiene {{itemsCount}} items por {{grandTotal}}.</p>',
    bodyText: null,
    variables: { required: ['customer', 'itemsCount', 'grandTotal'] },
    format: 'html',
    isActive: true,
    createdAt: new Date('2026-05-03'),
    updatedAt: new Date('2026-05-03T12:00:00Z'),
    ...overrides,
  } as EmailTemplate;
}

describe('TemplateRendererService.render', () => {
  it('renders subject + html with simple variables', async () => {
    const sut = new TemplateRendererService();
    const out = await sut.render(makeTemplate(), {
      customer: { firstName: 'Matias' },
      itemsCount: 3,
      grandTotal: '$12.500,00',
    });

    expect(out.subject).toContain('Hola Matias');
    expect(out.html).toContain('3 items');
    expect(out.html).toContain('$12.500,00');
  });

  it('escapes HTML in user-derived data (XSS guard)', async () => {
    const sut = new TemplateRendererService();
    const out = await sut.render(makeTemplate(), {
      customer: { firstName: '<script>alert("xss")</script>' },
      itemsCount: 1,
      grandTotal: '$100',
    });

    expect(out.subject).not.toContain('<script>');
    expect(out.subject).toContain('&lt;script&gt;');
  });

  it('throws TemplateRenderError when required variables are missing', async () => {
    const sut = new TemplateRendererService();
    await expect(() =>
      sut.render(makeTemplate(), {
        // intentionally missing `grandTotal`
        customer: { firstName: 'X' },
        itemsCount: 1,
      }),
    ).rejects.toThrow(TemplateRenderError);
  });

  it('throws TemplateRenderError when Handlebars source has a syntax error', async () => {
    const sut = new TemplateRendererService();
    const broken = makeTemplate({ subject: 'Hola {{customer.firstName' /* unclosed */ });
    await expect(() =>
      sut.render(broken, { customer: { firstName: 'X' }, itemsCount: 1, grandTotal: '$1' }),
    ).rejects.toThrow(TemplateRenderError);
  });

  it('caches by (id, updatedAt) — re-rendering with same template still works', async () => {
    const sut = new TemplateRendererService();
    const tpl = makeTemplate();
    const ctx = { customer: { firstName: 'A' }, itemsCount: 1, grandTotal: '$1' };

    const out1 = await sut.render(tpl, ctx);
    const out2 = await sut.render(tpl, { ...ctx, customer: { firstName: 'B' } });

    expect(out1.subject).toContain('Hola A');
    expect(out2.subject).toContain('Hola B');
  });

  it(
    'renders MJML format when template.format = mjml',
    async () => {
      const sut = new TemplateRendererService();
      const mjmlBody = `<mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Tu carrito de {{customer.firstName}}</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>`;
      const tpl = makeTemplate({
        format: 'mjml',
        bodyHtml: mjmlBody,
        variables: { required: ['customer'] },
      });

      const out = await sut.render(tpl, { customer: { firstName: 'Matias' } });

      expect(out.html).toContain('Tu carrito de Matias');
      // MJML compiles to a full HTML document — should include <html> wrapper.
      expect(out.html).toMatch(/<html/i);
    },
    // MJML compile is slower than Handlebars — give it a generous budget.
    15_000,
  );

  it('rejects unknown template formats', async () => {
    const sut = new TemplateRendererService();
    const tpl = makeTemplate({ format: 'markdown' });
    await expect(() =>
      sut.render(tpl, { customer: {}, itemsCount: 1, grandTotal: '$1' }),
    ).rejects.toThrow(TemplateRenderError);
  });

  it('renders bodyText when present', async () => {
    const sut = new TemplateRendererService();
    const tpl = makeTemplate({
      bodyText: 'Hola {{customer.firstName}} — {{itemsCount}} items',
    });

    const out = await sut.render(tpl, {
      customer: { firstName: 'X' },
      itemsCount: 2,
      grandTotal: '$1',
    });

    expect(out.text).toBe('Hola X — 2 items');
  });
});
