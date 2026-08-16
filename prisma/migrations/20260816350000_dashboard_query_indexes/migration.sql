CREATE INDEX "work_orders_organization_id_status_billed_at_id_idx"
ON "work_orders"("organization_id", "status", "billed_at" DESC, "id");

CREATE INDEX "work_orders_organization_id_status_actual_end_at_id_idx"
ON "work_orders"("organization_id", "status", "actual_end_at", "id");
