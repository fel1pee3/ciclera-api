-- A location is addressable together with its tenant and customer. This key is
-- the database-level guard that prevents equipment from crossing customer or
-- tenant boundaries.
CREATE UNIQUE INDEX "service_locations_organization_id_customer_id_id_key"
ON "service_locations"("organization_id", "customer_id", "id");

CREATE TABLE "equipment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "normalized_name" VARCHAR(160) NOT NULL,
    "identifier" VARCHAR(80) NOT NULL,
    "normalized_identifier" VARCHAR(80) NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "brand" VARCHAR(120),
    "model" VARCHAR(120),
    "serial_number" VARCHAR(120),
    "normalized_serial_number" VARCHAR(120),
    "notes" VARCHAR(2000),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "equipment_organization_id_id_key"
ON "equipment"("organization_id", "id");

-- PostgreSQL permits multiple NULL values in this unique index. Therefore a
-- provided serial is unique inside one organization, while omitted serials are
-- allowed on any number of equipment records.
CREATE UNIQUE INDEX "equipment_organization_id_normalized_serial_number_key"
ON "equipment"("organization_id", "normalized_serial_number");

CREATE INDEX "equipment_organization_id_normalized_name_id_idx"
ON "equipment"("organization_id", "normalized_name", "id");

CREATE INDEX "equipment_organization_id_normalized_identifier_id_idx"
ON "equipment"("organization_id", "normalized_identifier", "id");

CREATE INDEX "equipment_organization_id_customer_id_archived_at_id_idx"
ON "equipment"("organization_id", "customer_id", "archived_at", "id");

CREATE INDEX "equipment_organization_id_location_id_archived_at_id_idx"
ON "equipment"("organization_id", "location_id", "archived_at", "id");

ALTER TABLE "equipment"
ADD CONSTRAINT "equipment_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipment"
ADD CONSTRAINT "equipment_organization_id_customer_id_fkey"
FOREIGN KEY ("organization_id", "customer_id")
REFERENCES "customers"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipment"
ADD CONSTRAINT "equipment_organization_id_customer_id_location_id_fkey"
FOREIGN KEY ("organization_id", "customer_id", "location_id")
REFERENCES "service_locations"("organization_id", "customer_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
