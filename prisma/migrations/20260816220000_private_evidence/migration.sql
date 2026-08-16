CREATE TYPE "EvidenceKind" AS ENUM ('PHOTO', 'SIGNATURE');
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING', 'AVAILABLE');

CREATE TABLE "evidence" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "work_order_id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "kind" "EvidenceKind" NOT NULL,
  "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING',
  "object_key" VARCHAR(500) NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "content_type" VARCHAR(120) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "confirmed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evidence_size_positive" CHECK ("size_bytes" > 0)
);

CREATE UNIQUE INDEX "evidence_object_key_key" ON "evidence"("object_key");
CREATE UNIQUE INDEX "evidence_organization_id_id_key" ON "evidence"("organization_id", "id");
CREATE INDEX "evidence_organization_id_work_order_id_status_created_at_idx"
  ON "evidence"("organization_id", "work_order_id", "status", "created_at");
CREATE INDEX "evidence_organization_id_execution_id_status_created_at_idx"
  ON "evidence"("organization_id", "execution_id", "status", "created_at");

ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_work_order_fkey"
  FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_execution_fkey"
  FOREIGN KEY ("organization_id", "execution_id") REFERENCES "work_order_executions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_creator_fkey"
  FOREIGN KEY ("organization_id", "created_by_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
