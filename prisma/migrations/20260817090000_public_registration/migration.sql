-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "terms_version" VARCHAR(32) NOT NULL,
    "privacy_version" VARCHAR(32) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_acceptances_organization_id_user_id_terms_version_privacy_version_key"
ON "legal_acceptances"("organization_id", "user_id", "terms_version", "privacy_version");

-- CreateIndex
CREATE INDEX "legal_acceptances_organization_id_accepted_at_idx"
ON "legal_acceptances"("organization_id", "accepted_at" DESC);

-- AddForeignKey
ALTER TABLE "legal_acceptances"
ADD CONSTRAINT "legal_acceptances_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances"
ADD CONSTRAINT "legal_acceptances_organization_id_user_id_fkey"
FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
