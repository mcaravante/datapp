-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SyncEventType" ADD VALUE 'customer.logged_in';
ALTER TYPE "SyncEventType" ADD VALUE 'newsletter.deleted';
ALTER TYPE "SyncEventType" ADD VALUE 'cart.item_added';

-- NOTE: Prisma's auto-generated diff also produced
--   ALTER TABLE "order" ALTER COLUMN "real_revenue" DROP DEFAULT;
-- We removed it. `real_revenue` is a Postgres GENERATED ALWAYS column
-- (see the init migration); it has no DEFAULT and the ALTER fails with
-- `column "real_revenue" of relation "order" is a generated column`.
-- The drift is Prisma not understanding GENERATED columns, NOT a real
-- divergence in our schema.
