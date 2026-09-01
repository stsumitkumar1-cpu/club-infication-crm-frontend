/**
 * Mirrors the API policy in
 * backend/src/common/validators/is-strong-password.decorator.ts.
 * The server is authoritative; this only keeps the hint honest.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES =
  'At least 8 characters, with an uppercase letter, a lowercase letter and a number.';
