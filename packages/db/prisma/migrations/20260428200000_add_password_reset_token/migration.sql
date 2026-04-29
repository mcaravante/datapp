-- Self-service password reset: short-lived tokens emailed to the user.
-- The plaintext token never lands in the DB — we store sha256(token) so
-- a leaked dump can't be replayed.

CREATE TABLE "password_reset_token" (
    "id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "token_hash" char(64) NOT NULL,
    "expires_at" timestamptz(6) NOT NULL,
    "used_at" timestamptz(6),
    "ip_address" text,
    "user_agent" text,
    "created_at" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_token_token_hash_key"
    ON "password_reset_token" ("token_hash");

CREATE INDEX "password_reset_token_user_id_idx"
    ON "password_reset_token" ("user_id");

CREATE INDEX "password_reset_token_expires_at_idx"
    ON "password_reset_token" ("expires_at");

ALTER TABLE "password_reset_token"
    ADD CONSTRAINT "password_reset_token_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
