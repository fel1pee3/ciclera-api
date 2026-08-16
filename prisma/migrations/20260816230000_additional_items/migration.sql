CREATE TYPE "AdditionalItemType" AS ENUM ('MATERIAL', 'SERVICE', 'ADDITIONAL_HOUR');

CREATE TABLE "additional_items" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "work_order_id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "type" "AdditionalItemType" NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "quantity_in_thousand" BIGINT NOT NULL,
  "unit_amount_in_cents" BIGINT NOT NULL,
  "total_amount_in_cents" BIGINT NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "additional_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "additional_items_quantity_positive" CHECK ("quantity_in_thousand" > 0),
  CONSTRAINT "additional_items_unit_amount_nonnegative" CHECK ("unit_amount_in_cents" >= 0),
  CONSTRAINT "additional_items_total_nonnegative" CHECK ("total_amount_in_cents" >= 0)
);

CREATE UNIQUE INDEX "additional_items_organization_id_id_key"
  ON "additional_items"("organization_id", "id");
CREATE INDEX "additional_items_organization_id_work_order_id_created_at_id_idx"
  ON "additional_items"("organization_id", "work_order_id", "created_at", "id");
CREATE INDEX "additional_items_organization_id_execution_id_created_at_id_idx"
  ON "additional_items"("organization_id", "execution_id", "created_at", "id");

ALTER TABLE "additional_items" ADD CONSTRAINT "additional_items_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "additional_items" ADD CONSTRAINT "additional_items_work_order_fkey"
  FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "additional_items" ADD CONSTRAINT "additional_items_execution_fkey"
  FOREIGN KEY ("organization_id", "execution_id") REFERENCES "work_order_executions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "additional_items" ADD CONSTRAINT "additional_items_creator_fkey"
  FOREIGN KEY ("organization_id", "created_by_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "additional_items" ADD CONSTRAINT "additional_items_updater_fkey"
  FOREIGN KEY ("organization_id", "updated_by_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
