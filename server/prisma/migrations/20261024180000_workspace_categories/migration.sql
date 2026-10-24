CREATE TABLE "categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "workspaceOwnerId" TEXT,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categories_workspaceOwnerId_key_key" ON "categories"("workspaceOwnerId", "key");
CREATE UNIQUE INDEX "categories_legacy_key_key" ON "categories"("key") WHERE "workspaceOwnerId" IS NULL;
ALTER TABLE "categories" ADD CONSTRAINT "categories_workspaceOwnerId_fkey" FOREIGN KEY ("workspaceOwnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
