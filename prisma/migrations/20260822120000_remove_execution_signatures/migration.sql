DELETE FROM "evidence"
WHERE "kind" = 'SIGNATURE';

ALTER TABLE "evidence"
  DROP COLUMN "kind";

DROP TYPE "EvidenceKind";

UPDATE "reviews"
SET "reason" = 'OTHER'
WHERE "reason" = 'SIGNATURE_MISSING';

ALTER TYPE "ReviewReason" RENAME TO "ReviewReason_old";

CREATE TYPE "ReviewReason" AS ENUM (
  'REQUIRED_PHOTO_MISSING',
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
