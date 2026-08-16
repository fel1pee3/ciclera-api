CREATE TABLE "checklist_templates" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "template_key" VARCHAR(80) NOT NULL DEFAULT 'default',
  "name" VARCHAR(160) NOT NULL,
  "version" INTEGER NOT NULL,
  "fields" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checklist_templates_version_positive" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "checklist_templates_organization_id_id_key"
  ON "checklist_templates"("organization_id", "id");
CREATE UNIQUE INDEX "checklist_templates_organization_id_template_key_version_key"
  ON "checklist_templates"("organization_id", "template_key", "version");
CREATE INDEX "checklist_templates_organization_id_template_key_version_idx"
  ON "checklist_templates"("organization_id", "template_key", "version" DESC);

ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_creator_fkey"
  FOREIGN KEY ("organization_id", "created_by_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_order_executions"
  ADD COLUMN "checklist_template_id" UUID,
  ADD COLUMN "checklist_snapshot" JSONB;
ALTER TABLE "work_order_executions" ADD CONSTRAINT "work_order_executions_checklist_template_fkey"
  FOREIGN KEY ("organization_id", "checklist_template_id") REFERENCES "checklist_templates"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "checklist_responses" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "field_id" VARCHAR(80) NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "checklist_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checklist_responses_organization_id_id_key"
  ON "checklist_responses"("organization_id", "id");
CREATE UNIQUE INDEX "checklist_responses_organization_id_execution_id_field_id_key"
  ON "checklist_responses"("organization_id", "execution_id", "field_id");
CREATE INDEX "checklist_responses_organization_id_execution_id_updated_at_idx"
  ON "checklist_responses"("organization_id", "execution_id", "updated_at");

ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_execution_fkey"
  FOREIGN KEY ("organization_id", "execution_id") REFERENCES "work_order_executions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
