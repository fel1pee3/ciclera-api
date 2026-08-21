CREATE TYPE "SubscriptionPlanCode" AS ENUM ('ESSENTIAL', 'PROFESSIONAL', 'OPERATION');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'ENDED');
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('CREDIT_CARD', 'PIX', 'BOLETO');
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RECEIVED', 'OVERDUE', 'REFUNDED', 'CHARGEBACK', 'CANCELED');
CREATE TYPE "SubscriptionCheckoutStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELED');

CREATE TABLE "organization_subscriptions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "plan_code" "SubscriptionPlanCode",
  "scheduled_plan_code" "SubscriptionPlanCode",
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "payment_method" "SubscriptionPaymentMethod",
  "provider_customer_id" VARCHAR(80),
  "provider_subscription_id" VARCHAR(80),
  "current_period_start" TIMESTAMPTZ(6),
  "current_period_end" TIMESTAMPTZ(6),
  "next_due_date" DATE,
  "overdue_since" DATE,
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "canceled_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_checkouts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "plan_code" "SubscriptionPlanCode" NOT NULL,
  "payment_method" "SubscriptionPaymentMethod" NOT NULL,
  "status" "SubscriptionCheckoutStatus" NOT NULL DEFAULT 'PENDING',
  "provider_checkout_id" VARCHAR(100),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "subscription_checkouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_payments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "provider_payment_id" VARCHAR(100) NOT NULL,
  "provider_subscription_id" VARCHAR(80),
  "status" "SubscriptionPaymentStatus" NOT NULL,
  "payment_method" "SubscriptionPaymentMethod" NOT NULL,
  "amount_in_cents" BIGINT NOT NULL,
  "due_date" DATE NOT NULL,
  "paid_at" TIMESTAMPTZ(6),
  "invoice_url" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_webhook_events" (
  "id" UUID NOT NULL,
  "provider_event_id" VARCHAR(160) NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "organization_id" UUID,
  "resource_id" VARCHAR(100),
  "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_subscriptions_organization_id_key" ON "organization_subscriptions"("organization_id");
CREATE UNIQUE INDEX "organization_subscriptions_organization_id_id_key" ON "organization_subscriptions"("organization_id", "id");
CREATE UNIQUE INDEX "organization_subscriptions_provider_customer_id_key" ON "organization_subscriptions"("provider_customer_id");
CREATE UNIQUE INDEX "organization_subscriptions_provider_subscription_id_key" ON "organization_subscriptions"("provider_subscription_id");
CREATE INDEX "organization_subscriptions_status_next_due_date_idx" ON "organization_subscriptions"("status", "next_due_date");
CREATE UNIQUE INDEX "subscription_checkouts_organization_id_id_key" ON "subscription_checkouts"("organization_id", "id");
CREATE UNIQUE INDEX "subscription_checkouts_provider_checkout_id_key" ON "subscription_checkouts"("provider_checkout_id");
CREATE INDEX "subscription_checkouts_organization_id_status_created_at_idx" ON "subscription_checkouts"("organization_id", "status", "created_at" DESC);
CREATE UNIQUE INDEX "subscription_payments_organization_id_id_key" ON "subscription_payments"("organization_id", "id");
CREATE UNIQUE INDEX "subscription_payments_provider_payment_id_key" ON "subscription_payments"("provider_payment_id");
CREATE INDEX "subscription_payments_organization_id_due_date_id_idx" ON "subscription_payments"("organization_id", "due_date" DESC, "id");
CREATE INDEX "subscription_payments_organization_id_status_due_date_idx" ON "subscription_payments"("organization_id", "status", "due_date");
CREATE UNIQUE INDEX "subscription_webhook_events_provider_event_id_key" ON "subscription_webhook_events"("provider_event_id");
CREATE INDEX "subscription_webhook_events_organization_id_processed_at_idx" ON "subscription_webhook_events"("organization_id", "processed_at" DESC);

ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_checkouts" ADD CONSTRAINT "subscription_checkouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_checkouts" ADD CONSTRAINT "subscription_checkouts_organization_id_subscription_id_fkey" FOREIGN KEY ("organization_id", "subscription_id") REFERENCES "organization_subscriptions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_organization_id_subscription_id_fkey" FOREIGN KEY ("organization_id", "subscription_id") REFERENCES "organization_subscriptions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_webhook_events" ADD CONSTRAINT "subscription_webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
