-- 2FA recovery codes — single-use backup codes for users who lose
-- access to their authenticator app. Plaintext is shown once at
-- generation time; the DB only stores sha256(code).

CREATE TABLE "user_recovery_code" (
    "id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "code_hash" char(64) NOT NULL,
    "used_at" timestamptz(6),
    "created_at" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "user_recovery_code_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_recovery_code_code_hash_key"
    ON "user_recovery_code" ("code_hash");

CREATE INDEX "user_recovery_code_user_id_idx"
    ON "user_recovery_code" ("user_id");

ALTER TABLE "user_recovery_code"
    ADD CONSTRAINT "user_recovery_code_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
