-- =====================================================================
--  Operator-curated labels for Magento payment / shipping codes
-- =====================================================================
--
-- Pupemoda configures verbose titles for each payment method in their
-- Magento admin (e.g. "Mercado Pago (Debito|Credito|Dinero en cuenta)")
-- but Magento returns only the technical code (`mercadopago_basic`).
-- This table stores the friendly label per (tenant, kind, code) so
-- the breakdown reports can display them.

CREATE TABLE "analytics_method_label" (
    "id"         UUID NOT NULL,
    "tenant_id"  UUID NOT NULL,
    "kind"       TEXT NOT NULL,
    "code"       TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analytics_method_label_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_method_label_tenant_id_kind_code_key"
    ON "analytics_method_label"("tenant_id", "kind", "code");

ALTER TABLE "analytics_method_label"
    ADD CONSTRAINT "analytics_method_label_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
