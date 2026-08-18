UPDATE "reviews"
SET "reason" = 'OTHER'
WHERE "reason" = 'CHECKLIST_INCOMPLETE';

ALTER TABLE "work_order_executions"
  DROP CONSTRAINT "work_order_executions_checklist_template_fkey";

DROP TABLE "checklist_responses";

ALTER TABLE "work_order_executions"
  DROP COLUMN "checklist_template_id",
  DROP COLUMN "checklist_snapshot";

DROP TABLE "checklist_templates";

ALTER TYPE "ReviewReason" RENAME TO "ReviewReason_old";

CREATE TYPE "ReviewReason" AS ENUM (
  'REQUIRED_PHOTO_MISSING',
  'SIGNATURE_MISSING',
  'MATERIAL_WITHOUT_VALUE',
  'ADDITIONAL_SERVICE_UNAPPROVED',
  'EQUIPMENT_DATA_INCORRECT',
  'INCONSISTENT_SCHEDULE',
  'OTHER'
);

ALTER TABLE "reviews"
  ALTER COLUMN "reason" TYPE "ReviewReason"
  USING ("reason"::text::"ReviewReason");

DROP TYPE "ReviewReason_old";
