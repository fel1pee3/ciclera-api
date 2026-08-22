ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

CREATE INDEX "users_organization_id_deleted_at_role_idx"
ON "users"("organization_id", "deleted_at", "role");
