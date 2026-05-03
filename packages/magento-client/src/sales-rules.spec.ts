import { describe, it, expect, vi } from 'vitest';
import { MagentoSalesRulesResource } from './sales-rules';
import type { MagentoHttpClient } from './http';

/**
 * Build a stub `MagentoHttpClient` whose four JSON methods are vi.fn()s
 * so each test can assert exact url/body shapes and inject canned
 * responses. Casting via `unknown` because the real class has private
 * fields we don't want to fake.
 */
function makeStubHttp(overrides: Partial<Record<'getJson' | 'postJson' | 'putJson' | 'deleteJson', unknown>>) {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(),
    putJson: vi.fn(),
    deleteJson: vi.fn(),
    ...overrides,
  } as unknown as MagentoHttpClient & {
    getJson: ReturnType<typeof vi.fn>;
    postJson: ReturnType<typeof vi.fn>;
    putJson: ReturnType<typeof vi.fn>;
    deleteJson: ReturnType<typeof vi.fn>;
  };
}

const fakeRule = {
  rule_id: 42,
  name: 'Recovery 10% off — stage 1',
  is_active: true,
  coupon_type: 3,
  use_auto_generation: true,
  uses_per_coupon: 1,
  uses_per_customer: 1,
  simple_action: 'by_percent',
  discount_amount: 10,
  website_ids: [1],
  customer_group_ids: [0, 1, 2, 3],
  stop_rules_processing: true,
};

describe('MagentoSalesRulesResource.create', () => {
  it('POSTs to /V1/salesRules with the {rule:...} envelope', async () => {
    const http = makeStubHttp({});
    http.postJson.mockResolvedValueOnce(fakeRule);

    const sut = new MagentoSalesRulesResource(http);
    const out = await sut.create({ rule: { name: 'Recovery 10% off — stage 1' } });

    expect(http.postJson).toHaveBeenCalledTimes(1);
    expect(http.postJson).toHaveBeenCalledWith('/rest/V1/salesRules', {
      rule: { name: 'Recovery 10% off — stage 1' },
    });
    expect(out.rule_id).toBe(42);
    expect(out.is_active).toBe(true);
  });

  it('throws if Magento returns a payload that fails Zod validation', async () => {
    const http = makeStubHttp({});
    http.postJson.mockResolvedValueOnce({ rule_id: 'not-a-number', name: 'x' });

    const sut = new MagentoSalesRulesResource(http);
    await expect(sut.create({ rule: { name: 'x' } })).rejects.toThrow();
  });
});

describe('MagentoSalesRulesResource.get', () => {
  it('GETs /V1/salesRules/:id and parses the response', async () => {
    const http = makeStubHttp({});
    http.getJson.mockResolvedValueOnce(fakeRule);

    const sut = new MagentoSalesRulesResource(http);
    const out = await sut.get(42);

    expect(http.getJson).toHaveBeenCalledWith('/rest/V1/salesRules/42');
    expect(out.rule_id).toBe(42);
  });
});

describe('MagentoSalesRulesResource.update', () => {
  it('PUTs to /V1/salesRules/:id with the {rule:...} envelope', async () => {
    const http = makeStubHttp({});
    http.putJson.mockResolvedValueOnce({ ...fakeRule, name: 'New name' });

    const sut = new MagentoSalesRulesResource(http);
    const out = await sut.update(42, { name: 'New name' });

    expect(http.putJson).toHaveBeenCalledWith('/rest/V1/salesRules/42', {
      rule: { name: 'New name' },
    });
    expect(out.name).toBe('New name');
  });
});

describe('MagentoSalesRulesResource.remove', () => {
  it('returns true on Magento literal-true response', async () => {
    const http = makeStubHttp({});
    http.deleteJson.mockResolvedValueOnce(true);

    const sut = new MagentoSalesRulesResource(http);
    const out = await sut.remove(42);

    expect(http.deleteJson).toHaveBeenCalledWith('/rest/V1/salesRules/42');
    expect(out).toBe(true);
  });

  it('throws if Magento responds with anything other than true', async () => {
    const http = makeStubHttp({});
    http.deleteJson.mockResolvedValueOnce({ unexpected: 'shape' });

    const sut = new MagentoSalesRulesResource(http);
    await expect(sut.remove(42)).rejects.toThrow(/returned/);
  });
});

describe('MagentoSalesRulesResource.generateCoupons', () => {
  it('POSTs to /V1/coupons/generate with the validated couponSpec and parses the array', async () => {
    const http = makeStubHttp({});
    http.postJson.mockResolvedValueOnce(['ABCD12345678', 'EFGH98765432']);

    const sut = new MagentoSalesRulesResource(http);
    const codes = await sut.generateCoupons({
      couponSpec: { rule_id: 42, quantity: 2, length: 12, format: 'alphanumeric' },
    });

    expect(http.postJson).toHaveBeenCalledTimes(1);
    const [url, body] = http.postJson.mock.calls[0]!;
    expect(url).toBe('/rest/V1/coupons/generate');
    // The Zod parse fills in defaults — we should see length / format echoed back
    expect(body).toMatchObject({
      couponSpec: {
        rule_id: 42,
        quantity: 2,
        length: 12,
        format: 'alphanumeric',
      },
    });
    expect(codes).toEqual(['ABCD12345678', 'EFGH98765432']);
  });

  it('rejects malformed inputs at the input boundary', async () => {
    const http = makeStubHttp({});

    const sut = new MagentoSalesRulesResource(http);
    await expect(
      sut.generateCoupons({
        couponSpec: { rule_id: 42, quantity: 0 } as never,
      }),
    ).rejects.toThrow();
    expect(http.postJson).not.toHaveBeenCalled();
  });
});

describe('MagentoSalesRulesResource.deleteCouponsByIds', () => {
  it('POSTs to /V1/coupons/deleteByIds with ignoreInvalidCoupons:true', async () => {
    const http = makeStubHttp({});
    http.postJson.mockResolvedValueOnce({ missing_items: [] });

    const sut = new MagentoSalesRulesResource(http);
    const out = await sut.deleteCouponsByIds([1, 2, 3]);

    expect(http.postJson).toHaveBeenCalledWith('/rest/V1/coupons/deleteByIds', {
      ids: [1, 2, 3],
      ignoreInvalidCoupons: true,
    });
    expect(out.missing_items).toEqual([]);
  });

  it('parses missing_items into typed shape', async () => {
    const http = makeStubHttp({});
    http.postJson.mockResolvedValueOnce({
      missing_items: [{ id: 99, message: 'Coupon does not exist' }],
    });

    const sut = new MagentoSalesRulesResource(http);
    const out = await sut.deleteCouponsByIds([99]);

    expect(out.missing_items).toEqual([{ id: 99, message: 'Coupon does not exist' }]);
  });
});
