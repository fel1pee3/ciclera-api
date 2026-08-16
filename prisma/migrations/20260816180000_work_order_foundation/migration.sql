CREATE TYPE "WorkOrderStatus" AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'IN_PROGRESS',
  'AWAITING_REVIEW',
  'PENDING_CORRECTION',
  'READY_TO_BILL',
  'BILLED',
  'CANCELED'
);

CREATE TYPE "WorkOrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE UNIQUE INDEX "equipment_organization_id_customer_id_location_id_id_key"
ON "equipment"("organization_id", "customer_id", "location_id", "id");

CREATE TABLE "work_order_counters" (
  "organization_id" UUID NOT NULL,
  "last_number" BIGINT NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "work_order_counters_pkey" PRIMARY KEY ("organization_id")
);

CREATE TABLE "work_orders" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "work_order_number" BIGINT NOT NULL,
  "customer_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "equipment_id" UUID,
  "service_type" VARCHAR(120) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "normalized_title" VARCHAR(160) NOT NULL,
  "description" VARCHAR(4000) NOT NULL,
  "priority" "WorkOrderPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduled_start_at" TIMESTAMPTZ(6),
  "scheduled_end_at" TIMESTAMPTZ(6),
  "actual_start_at" TIMESTAMPTZ(6),
  "actual_end_at" TIMESTAMPTZ(6),
  "expected_amount_in_cents" BIGINT,
  "final_amount_in_cents" BIGINT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" UUID NOT NULL,
  "canceled_by_user_id" UUID,
  "canceled_at" TIMESTAMPTZ(6),
  "cancellation_reason" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_order_status_history" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "work_order_id" UUID NOT NULL,
  "previous_status" "WorkOrderStatus",
  "new_status" "WorkOrderStatus" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "reason" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_order_status_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_orders_organization_id_id_key"
ON "work_orders"("organization_id", "id");
CREATE UNIQUE INDEX "work_orders_organization_id_work_order_number_key"
ON "work_orders"("organization_id", "work_order_number");
CREATE INDEX "work_orders_organization_id_status_created_at_id_idx"
ON "work_orders"("organization_id", "status", "created_at" DESC, "id");
CREATE INDEX "work_orders_organization_id_customer_id_created_at_id_idx"
ON "work_orders"("organization_id", "customer_id", "created_at" DESC, "id");
CREATE INDEX "work_orders_organization_id_scheduled_start_at_id_idx"
ON "work_orders"("organization_id", "scheduled_start_at", "id");
CREATE INDEX "work_orders_organization_id_normalized_title_id_idx"
ON "work_orders"("organization_id", "normalized_title", "id");
CREATE INDEX "work_order_status_history_organization_id_work_order_id_created_at_id_idx"
ON "work_order_status_history"("organization_id", "work_order_id", "created_at", "id");

ALTER TABLE "work_order_counters"
ADD CONSTRAINT "work_order_counters_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_orders"
ADD CONSTRAINT "work_orders_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders"
ADD CONSTRAINT "work_orders_organization_id_customer_id_fkey"
FOREIGN KEY ("organization_id", "customer_id")
REFERENCES "customers"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders"
ADD CONSTRAINT "work_orders_organization_id_customer_id_location_id_fkey"
FOREIGN KEY ("organization_id", "customer_id", "location_id")
REFERENCES "service_locations"("organization_id", "customer_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders"
ADD CONSTRAINT "work_orders_organization_id_customer_id_location_id_equipment_id_fkey"
FOREIGN KEY ("organization_id", "customer_id", "location_id", "equipment_id")
REFERENCES "equipment"("organization_id", "customer_id", "location_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders"
ADD CONSTRAINT "work_orders_organization_id_created_by_user_id_fkey"
FOREIGN KEY ("organization_id", "created_by_user_id")
REFERENCES "users"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders"
ADD CONSTRAINT "work_orders_organization_id_canceled_by_user_id_fkey"
FOREIGN KEY ("organization_id", "canceled_by_user_id")
REFERENCES "users"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_order_status_history"
ADD CONSTRAINT "work_order_status_history_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_status_history"
ADD CONSTRAINT "work_order_status_history_organization_id_work_order_id_fkey"
FOREIGN KEY ("organization_id", "work_order_id")
REFERENCES "work_orders"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_status_history"
ADD CONSTRAINT "work_order_status_history_organization_id_actor_user_id_fkey"
FOREIGN KEY ("organization_id", "actor_user_id")
REFERENCES "users"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
