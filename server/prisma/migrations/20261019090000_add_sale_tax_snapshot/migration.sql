-- Safe additive migration for IMP-16: Persist checkout tax rate and tax amount snapshot per Sale.
-- Existing legacy invoices retain NULL for taxRate and taxAmount so historical records are never fabricated.
ALTER TABLE "sales"
  ADD COLUMN "taxRate" DOUBLE PRECISION,
  ADD COLUMN "taxAmount" DOUBLE PRECISION;
