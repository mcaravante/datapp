-- Make `user.password_hash` nullable so a user can be authorized to
-- sign in via Google OAuth only (no local password). The login flow
-- still applies argon2 to a sentinel hash for users with NULL, so the
-- timing channel between "wrong password" and "no password set" stays
-- closed.

ALTER TABLE "user" ALTER COLUMN "password_hash" DROP NOT NULL;
