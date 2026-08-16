ALTER TABLE "work_orders"
  ADD COLUMN "billed_at" TIMESTAMPTZ(6),
  ADD COLUMN "billed_by_user_id" UUID;

CREATE INDEX "work_orders_organization_id_status_final_amount_in_cents_idx"
  ON "work_orders"("organization_id", "status", "final_amount_in_cents");

ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_billed_by_fkey"
  FOREIGN KEY ("organization_id", "billed_by_user_id")
  REFERENCES "users"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
