CREATE TYPE "ReviewDecision" AS ENUM ('CORRECTION_REQUESTED', 'APPROVED');
CREATE TYPE "ReviewReason" AS ENUM (
  'REQUIRED_PHOTO_MISSING',
  'SIGNATURE_MISSING',
  'CHECKLIST_INCOMPLETE',
  'MATERIAL_WITHOUT_VALUE',
  'ADDITIONAL_SERVICE_UNAPPROVED',
  'EQUIPMENT_DATA_INCORRECT',
  'INCONSISTENT_SCHEDULE',
  'OTHER'
);

CREATE TABLE "reviews" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "work_order_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "decision" "ReviewDecision" NOT NULL,
  "reason" "ReviewReason",
  "description" VARCHAR(2000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reviews_correction_fields" CHECK (
    ("decision" = 'CORRECTION_REQUESTED' AND "reason" IS NOT NULL AND length(trim("description")) >= 3)
    OR ("decision" = 'APPROVED' AND "reason" IS NULL)
  )
);

CREATE UNIQUE INDEX "reviews_organization_id_id_key" ON "reviews"("organization_id", "id");
CREATE INDEX "reviews_organization_id_work_order_id_created_at_id_idx"
  ON "reviews"("organization_id", "work_order_id", "created_at" DESC, "id");
CREATE INDEX "reviews_organization_id_decision_created_at_id_idx"
  ON "reviews"("organization_id", "decision", "created_at" DESC, "id");

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_work_order_fkey"
  FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_actor_fkey"
  FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
