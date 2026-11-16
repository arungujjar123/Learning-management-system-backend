// Single source of truth for JWT settings. The secret must come from the
// environment: a fallback string in source code would let anyone who reads
// the repository forge a token for any user and role.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET is missing or shorter than 32 characters. " +
      "Set it in .env (generate one with: openssl rand -hex 32)."
  );
}

// Login tokens expire; "1d" means users sign in again after a day.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

// Password-reset tokens carry this purpose and must never be accepted as a login token.
const RESET_TOKEN_PURPOSE = "password-reset";

module.exports = { JWT_SECRET, JWT_EXPIRES_IN, RESET_TOKEN_PURPOSE };
