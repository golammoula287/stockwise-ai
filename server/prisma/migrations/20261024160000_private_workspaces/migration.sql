-- Preserve all existing accounts and fictional business rows in the legacy workspace.
ALTER TABLE "users" ADD COLUMN "privateWorkspace" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ALTER COLUMN "privateWorkspace" SET DEFAULT true;

ALTER TABLE "products" ADD COLUMN "workspaceOwnerId" TEXT;
ALTER TABLE "customers" ADD COLUMN "workspaceOwnerId" TEXT;
ALTER TABLE "sales" ADD COLUMN "workspaceOwnerId" TEXT;
ALTER TABLE "stock_logs" ADD COLUMN "workspaceOwnerId" TEXT;

ALTER TABLE "products" ADD CONSTRAINT "products_workspaceOwnerId_fkey" FOREIGN KEY ("workspaceOwnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspaceOwnerId_fkey" FOREIGN KEY ("workspaceOwnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_workspaceOwnerId_fkey" FOREIGN KEY ("workspaceOwnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_logs" ADD CONSTRAINT "stock_logs_workspaceOwnerId_fkey" FOREIGN KEY ("workspaceOwnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "products_sku_key";
CREATE UNIQUE INDEX "products_workspaceOwnerId_sku_key" ON "products"("workspaceOwnerId", "sku");
CREATE UNIQUE INDEX "products_legacy_sku_key" ON "products"("sku") WHERE "workspaceOwnerId" IS NULL;
CREATE INDEX "products_workspaceOwnerId_idx" ON "products"("workspaceOwnerId");
CREATE INDEX "customers_workspaceOwnerId_idx" ON "customers"("workspaceOwnerId");
CREATE INDEX "sales_workspaceOwnerId_createdAt_idx" ON "sales"("workspaceOwnerId", "createdAt");
CREATE INDEX "stock_logs_workspaceOwnerId_idx" ON "stock_logs"("workspaceOwnerId");
