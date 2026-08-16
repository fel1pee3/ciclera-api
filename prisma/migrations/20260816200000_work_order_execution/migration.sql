CREATE TABLE "work_order_executions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "work_order_id" UUID NOT NULL,
  "technician_id" UUID NOT NULL,
  "notes" VARCHAR(4000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "work_order_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_order_executions_version_positive" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "work_order_executions_organization_id_id_key"
  ON "work_order_executions"("organization_id", "id");
CREATE UNIQUE INDEX "work_order_executions_organization_id_work_order_id_key"
  ON "work_order_executions"("organization_id", "work_order_id");
CREATE INDEX "work_order_executions_organization_id_technician_id_updated_at_id_idx"
  ON "work_order_executions"("organization_id", "technician_id", "updated_at" DESC, "id");

ALTER TABLE "work_order_executions" ADD CONSTRAINT "work_order_executions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_executions" ADD CONSTRAINT "work_order_executions_organization_id_work_order_id_fkey"
  FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_executions" ADD CONSTRAINT "work_order_executions_organization_id_technician_id_fkey"
  FOREIGN KEY ("organization_id", "technician_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
