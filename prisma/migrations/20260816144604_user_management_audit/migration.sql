-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" UUID NOT NULL,
    "request_id" VARCHAR(128) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_resource_type_resource_id_create_idx" ON "audit_logs"("organization_id", "resource_type", "resource_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_actor_user_id_created_at_idx" ON "audit_logs"("organization_id", "actor_user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_actor_user_id_fkey" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
