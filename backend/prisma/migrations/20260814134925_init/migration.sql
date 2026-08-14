-- CreateEnum
CREATE TYPE "provider_kind" AS ENUM ('GOOGLE', 'DISCORD', 'GITHUB', 'OIDC', 'OAUTH2');

-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('OWNER', 'ADMIN');

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "client_id" TEXT NOT NULL,
    "token_ttl_seconds" INTEGER NOT NULL DEFAULT 3600,
    "allow_email_linking" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_redirect_uris" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "uri" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_redirect_uris_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_providers" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "kind" "provider_kind" NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "icon_name" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "client_id" TEXT NOT NULL,
    "client_secret_enc" TEXT NOT NULL,
    "client_secret_last4" TEXT NOT NULL,
    "client_secret_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scopes" TEXT[],
    "authorization_url" TEXT,
    "token_url" TEXT,
    "userinfo_url" TEXT,
    "issuer" TEXT,
    "use_pkce" BOOLEAN NOT NULL DEFAULT true,
    "claim_sub" TEXT DEFAULT 'sub',
    "claim_email" TEXT DEFAULT 'email',
    "claim_username" TEXT DEFAULT 'preferred_username',
    "claim_avatar" TEXT DEFAULT 'picture',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_signing_keys" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "kid" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'RS256',
    "public_key_pem" TEXT NOT NULL,
    "private_key_enc" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "application_signing_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "email" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "avatar_url" TEXT,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "application_provider_id" UUID NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "raw_profile" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_transactions" (
    "id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "application_id" UUID NOT NULL,
    "application_provider_id" UUID NOT NULL,
    "code_verifier" TEXT NOT NULL,
    "code_challenge_method" TEXT NOT NULL DEFAULT 'S256',
    "nonce" TEXT,
    "redirect_uri" TEXT NOT NULL,
    "consumer_state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "auth_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "admin_role" NOT NULL DEFAULT 'ADMIN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "applications_slug_key" ON "applications"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "applications_client_id_key" ON "applications"("client_id");

-- CreateIndex
CREATE INDEX "application_redirect_uris_application_id_idx" ON "application_redirect_uris"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_redirect_uris_application_id_uri_key" ON "application_redirect_uris"("application_id", "uri");

-- CreateIndex
CREATE INDEX "application_providers_application_id_is_enabled_idx" ON "application_providers"("application_id", "is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "application_providers_application_id_slug_key" ON "application_providers"("application_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "application_signing_keys_kid_key" ON "application_signing_keys"("kid");

-- CreateIndex
CREATE INDEX "application_signing_keys_application_id_is_active_idx" ON "application_signing_keys"("application_id", "is_active");

-- CreateIndex
CREATE INDEX "users_application_id_created_at_idx" ON "users"("application_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_application_id_email_key" ON "users"("application_id", "email");

-- CreateIndex
CREATE INDEX "identities_user_id_idx" ON "identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "identities_application_provider_id_provider_account_id_key" ON "identities"("application_provider_id", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_transactions_state_key" ON "auth_transactions"("state");

-- CreateIndex
CREATE INDEX "auth_transactions_expires_at_idx" ON "auth_transactions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_user_id_idx" ON "admin_sessions"("admin_user_id");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "application_redirect_uris" ADD CONSTRAINT "application_redirect_uris_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_providers" ADD CONSTRAINT "application_providers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_signing_keys" ADD CONSTRAINT "application_signing_keys_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_application_provider_id_fkey" FOREIGN KEY ("application_provider_id") REFERENCES "application_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_transactions" ADD CONSTRAINT "auth_transactions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_transactions" ADD CONSTRAINT "auth_transactions_application_provider_id_fkey" FOREIGN KEY ("application_provider_id") REFERENCES "application_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
