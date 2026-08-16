-- CreateEnum
CREATE TYPE "ServiceLocationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "normalized_name" VARCHAR(160) NOT NULL,
    "document" VARCHAR(32),
    "normalized_document" VARCHAR(32),
    "email" VARCHAR(320),
    "phone" VARCHAR(32),
    "notes" VARCHAR(2000),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "normalized_name" VARCHAR(160) NOT NULL,
    "postal_code" VARCHAR(16) NOT NULL,
    "street" VARCHAR(160) NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "complement" VARCHAR(120),
    "neighborhood" VARCHAR(120) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "state" CHAR(2) NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'BR',
    "contact_name" VARCHAR(160),
    "contact_phone" VARCHAR(32),
    "access_instructions" VARCHAR(1000),
    "status" "ServiceLocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_id_key" ON "customers"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_normalized_document_key" ON "customers"("organization_id", "normalized_document");

-- CreateIndex
CREATE INDEX "customers_organization_id_normalized_name_id_idx" ON "customers"("organization_id", "normalized_name", "id");

-- CreateIndex
CREATE INDEX "customers_organization_id_archived_at_id_idx" ON "customers"("organization_id", "archived_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_locations_organization_id_id_key" ON "service_locations"("organization_id", "id");

-- CreateIndex
CREATE INDEX "service_locations_tenant_customer_status_name_idx" ON "service_locations"("organization_id", "customer_id", "status", "normalized_name", "id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
