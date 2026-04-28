-- role_section_access: per-tenant matrix of which roles can see which
-- sidebar sections. Only `analyst` and `viewer` rows ship by default;
-- super_admin and admin bypass this table and always see everything.

CREATE TABLE "role_section_access" (
  "tenant_id" UUID NOT NULL,
  "role"      "UserRole" NOT NULL,
  "section"   TEXT NOT NULL,
  "allowed"   BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "role_section_access_pkey" PRIMARY KEY ("tenant_id", "role", "section"),
  CONSTRAINT "role_section_access_tenant_fk" FOREIGN KEY ("tenant_id")
    REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "role_section_access_tenant_role_idx"
  ON "role_section_access"("tenant_id", "role");

-- Seed sensible defaults for every existing tenant. Analyst gets the
-- full read surface; viewer gets headline + customer + order/product
-- visibility but loses sync/segments/coupons.
INSERT INTO "role_section_access" ("tenant_id", "role", "section", "allowed")
SELECT t.id, 'analyst'::"UserRole", s.section, true
FROM "tenant" t
CROSS JOIN (
  VALUES
    ('overview'),
    ('customers'),
    ('segments'),
    ('orders'),
    ('carts'),
    ('products'),
    ('coupons'),
    ('regions'),
    ('insights'),
    ('sync')
) AS s(section)
ON CONFLICT DO NOTHING;

INSERT INTO "role_section_access" ("tenant_id", "role", "section", "allowed")
SELECT t.id, 'viewer'::"UserRole", s.section, s.allowed
FROM "tenant" t
CROSS JOIN (
  VALUES
    ('overview', true),
    ('customers', true),
    ('segments', false),
    ('orders', true),
    ('carts', false),
    ('products', true),
    ('coupons', false),
    ('regions', true),
    ('insights', true),
    ('sync', false)
) AS s(section, allowed)
ON CONFLICT DO NOTHING;
