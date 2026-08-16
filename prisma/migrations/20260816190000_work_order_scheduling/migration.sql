CREATE TABLE "work_order_assignments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "work_order_id" UUID NOT NULL,
  "technician_id" UUID NOT NULL,
  "assigned_by_user_id" UUID NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unassigned_by_user_id" UUID,
  "unassigned_at" TIMESTAMPTZ(6),
  CONSTRAINT "work_order_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_order_assignments_closed_consistently" CHECK (
    ("unassigned_at" IS NULL AND "unassigned_by_user_id" IS NULL)
    OR ("unassigned_at" IS NOT NULL AND "unassigned_by_user_id" IS NOT NULL AND "unassigned_at" >= "assigned_at")
  )
);

CREATE UNIQUE INDEX "work_order_assignments_organization_id_id_key"
  ON "work_order_assignments"("organization_id", "id");
CREATE UNIQUE INDEX "work_order_assignments_one_active_per_order_key"
  ON "work_order_assignments"("organization_id", "work_order_id")
  WHERE "unassigned_at" IS NULL;
CREATE INDEX "work_order_assignments_organization_id_work_order_id_assigned_at_id_idx"
  ON "work_order_assignments"("organization_id", "work_order_id", "assigned_at", "id");
CREATE INDEX "work_order_assignments_organization_id_technician_id_unassigned_at_assigned_at_idx"
  ON "work_order_assignments"("organization_id", "technician_id", "unassigned_at", "assigned_at");

ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_organization_id_work_order_id_fkey"
  FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_organization_id_technician_id_fkey"
  FOREIGN KEY ("organization_id", "technician_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_organization_id_assigned_by_user_id_fkey"
  FOREIGN KEY ("organization_id", "assigned_by_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_organization_id_unassigned_by_user_id_fkey"
  FOREIGN KEY ("organization_id", "unassigned_by_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
