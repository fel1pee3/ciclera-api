CREATE TABLE "initial_data_imports" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "checksum" CHAR(64) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "initial_data_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "initial_data_imports_organization_id_checksum_key"
ON "initial_data_imports"("organization_id", "checksum");

CREATE INDEX "initial_data_imports_organization_id_created_at_id_idx"
ON "initial_data_imports"("organization_id", "created_at" DESC, "id");

ALTER TABLE "initial_data_imports"
ADD CONSTRAINT "initial_data_imports_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "initial_data_imports"
ADD CONSTRAINT "initial_data_imports_organization_id_created_by_user_id_fkey"
FOREIGN KEY ("organization_id", "created_by_user_id")
REFERENCES "users"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
