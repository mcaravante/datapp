import { describe, it, expect, vi } from 'vitest';
import { CouponStrategyService } from './coupon-strategy.service';
import type { MagentoClient } from '@datapp/magento-client';
import type { EmailCampaignStage } from '@datapp/db';
import type { PrismaService } from '../../db/prisma.service';

function makeStage(overrides: Partial<EmailCampaignStage> = {}): EmailCampaignStage {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    tenantId: '01900000-0000-7000-8000-00000000aaaa',
    campaignId: '01900000-0000-7000-8000-00000000bbbb',
    templateId: '01900000-0000-7000-8000-00000000cccc',
    position: 1,
    delayHours: 1,
    couponMode: 'none',
    couponStaticCode: null,
    magentoSalesRuleId: null,
    couponDiscount: null,
    couponDiscountType: null,
    couponTtlHours: null,
    isActive: true,
    createdAt: new Date('2026-05-03'),
    updatedAt: new Date('2026-05-03'),
    ...overrides,
  } as EmailCampaignStage;
}

function makeMagento(overrides: {
  generateCoupons?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
}) {
  return {
    salesRules: {
      generateCoupons: overrides.generateCoupons ?? vi.fn(),
      create: overrides.create ?? vi.fn(),
    },
  } as unknown as MagentoClient;
}

function makeStubPrisma() {
  return {
    emailCampaignStage: {
      update: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

describe('CouponStrategyService.resolve', () => {
  describe('mode = none', () => {
    it('returns null code with source=none and never touches Magento', async () => {
      const prisma = makeStubPrisma();
      const magento = makeMagento({});
      const sut = new CouponStrategyService(prisma);

      const out = await sut.resolve(makeStage({ couponMode: 'none' }), magento);

      expect(out).toEqual({ code: null, salesRuleId: null, source: 'none' });
      expect(magento.salesRules.create).not.toHaveBeenCalled();
      expect(magento.salesRules.generateCoupons).not.toHaveBeenCalled();
    });
  });

  describe('mode = static_code', () => {
    it('returns the literal code and source=static_code', async () => {
      const prisma = makeStubPrisma();
      const magento = makeMagento({});
      const sut = new CouponStrategyService(prisma);

      const out = await sut.resolve(
        makeStage({ couponMode: 'static_code', couponStaticCode: 'RECUPERO10' }),
        magento,
      );

      expect(out).toEqual({ code: 'RECUPERO10', salesRuleId: null, source: 'static_code' });
      expect(magento.salesRules.generateCoupons).not.toHaveBeenCalled();
    });

    it('falls back to none when couponStaticCode is empty', async () => {
      const prisma = makeStubPrisma();
      const magento = makeMagento({});
      const sut = new CouponStrategyService(prisma);

      const out = await sut.resolve(
        makeStage({ couponMode: 'static_code', couponStaticCode: '   ' }),
        magento,
      );

      expect(out).toEqual({ code: null, salesRuleId: null, source: 'none' });
    });
  });

  describe('mode = unique_code', () => {
    it('reuses an existing magentoSalesRuleId without recreating', async () => {
      const prisma = makeStubPrisma();
      const magento = makeMagento({
        generateCoupons: vi.fn().mockResolvedValue(['ABC123XYZ456']),
      });
      const sut = new CouponStrategyService(prisma);

      const out = await sut.resolve(
        makeStage({ couponMode: 'unique_code', magentoSalesRuleId: 99 }),
        magento,
      );

      expect(out).toEqual({ code: 'ABC123XYZ456', salesRuleId: 99, source: 'unique_code' });
      expect(magento.salesRules.create).not.toHaveBeenCalled();
      expect(magento.salesRules.generateCoupons).toHaveBeenCalledWith({
        couponSpec: { rule_id: 99, quantity: 1, length: 12, format: 'alphanumeric' },
      });
      expect(prisma.emailCampaignStage.update).not.toHaveBeenCalled();
    });

    it('lazily creates the rule, persists the id, then generates a code', async () => {
      const prisma = makeStubPrisma();
      const create = vi.fn().mockResolvedValue({
        rule_id: 200,
        name: 'CDP recovery',
        is_active: true,
        coupon_type: 3,
        simple_action: 'by_percent',
        discount_amount: 10,
        website_ids: [1],
        customer_group_ids: [0],
        stop_rules_processing: false,
      });
      const generateCoupons = vi.fn().mockResolvedValue(['NEW1234ABCD']);
      const magento = makeMagento({ create, generateCoupons });
      const sut = new CouponStrategyService(prisma);

      const stage = makeStage({
        couponMode: 'unique_code',
        magentoSalesRuleId: null,
        couponDiscount: { toString: () => '10' } as never,
        couponDiscountType: 'percent',
        couponTtlHours: 48,
      });

      const out = await sut.resolve(stage, magento);

      expect(create).toHaveBeenCalledTimes(1);
      const [createArg] = create.mock.calls[0]!;
      expect(createArg.rule).toMatchObject({
        coupon_type: 3,
        use_auto_generation: true,
        uses_per_coupon: 1,
        uses_per_customer: 1,
        simple_action: 'by_percent',
        discount_amount: 10,
      });
      expect(createArg.rule.from_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(createArg.rule.to_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(prisma.emailCampaignStage.update).toHaveBeenCalledWith({
        where: { id: stage.id },
        data: { magentoSalesRuleId: 200 },
      });

      expect(generateCoupons).toHaveBeenCalledWith({
        couponSpec: { rule_id: 200, quantity: 1, length: 12, format: 'alphanumeric' },
      });

      expect(out).toEqual({ code: 'NEW1234ABCD', salesRuleId: 200, source: 'unique_code' });
    });

    it('uses cart_fixed action when couponDiscountType=fixed', async () => {
      const prisma = makeStubPrisma();
      const create = vi.fn().mockResolvedValue({
        rule_id: 300,
        name: 'X',
        is_active: true,
        coupon_type: 3,
        simple_action: 'cart_fixed',
        discount_amount: 500,
        website_ids: [1],
        customer_group_ids: [0],
        stop_rules_processing: false,
      });
      const generateCoupons = vi.fn().mockResolvedValue(['FIXEDCODE123']);
      const magento = makeMagento({ create, generateCoupons });
      const sut = new CouponStrategyService(prisma);

      await sut.resolve(
        makeStage({
          couponMode: 'unique_code',
          couponDiscount: { toString: () => '500' } as never,
          couponDiscountType: 'fixed',
        }),
        magento,
      );

      expect(create.mock.calls[0]![0].rule.simple_action).toBe('cart_fixed');
    });

    it('throws if Magento returns 0 codes from generateCoupons', async () => {
      const prisma = makeStubPrisma();
      const magento = makeMagento({
        generateCoupons: vi.fn().mockResolvedValue([]),
      });
      const sut = new CouponStrategyService(prisma);

      await expect(
        sut.resolve(
          makeStage({ couponMode: 'unique_code', magentoSalesRuleId: 1 }),
          magento,
        ),
      ).rejects.toThrow(/0 codes/);
    });
  });
});
