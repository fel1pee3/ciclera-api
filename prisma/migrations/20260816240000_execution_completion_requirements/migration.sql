ALTER TABLE "checklist_templates"
  ADD COLUMN "require_photo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "require_signature" BOOLEAN NOT NULL DEFAULT false;
