/** Mirrors `AuthorizationErrorCode` in src-tauri/src/services/entitlements.rs. */
export type AuthorizationErrorCode =
  | "pro_required"
  | "household_required"
  | "entitlement_unavailable";

/** Mirrors `AuthorizationError`. */
export interface AuthorizationError {
  code: AuthorizationErrorCode;
  capability: string;
  requiredProduct: string;
}

const CODES = new Set<string>([
  "pro_required",
  "household_required",
  "entitlement_unavailable",
]);

/**
 * Recognises the structured refusal the Rust gate returns.
 *
 * Gated commands answer `Result<_, String>` like every other command, so the
 * refusal travels as JSON inside that string. Anything that does not parse into
 * a known code is an ordinary failure and is left alone.
 */
export function parseAuthorizationError(
  error: unknown,
): AuthorizationError | null {
  const text =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : null;
  if (!text || !text.trimStart().startsWith("{")) return null;

  try {
    const parsed: unknown = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === "object" &&
      "code" in parsed &&
      typeof (parsed as { code: unknown }).code === "string" &&
      CODES.has((parsed as { code: string }).code)
    ) {
      return parsed as AuthorizationError;
    }
  } catch {
    // Not our refusal; fall through.
  }

  return null;
}

/**
 * Turns any command failure into something worth showing someone.
 *
 * The two refusals read differently on purpose. "You do not own this" invites a
 * purchase; "we could not check" invites a retry. Offering to sell Pro to
 * somebody who already bought it — because the Store happened to be
 * unreachable — is the worse of the two mistakes, so they never share wording.
 */
export function describeCommandError(error: unknown): string {
  const refusal = parseAuthorizationError(error);
  if (!refusal) return String(error);

  switch (refusal.code) {
    case "pro_required":
      return "This is a Mote Pro feature. Unlock Pro with a one-time purchase to use it.";
    case "household_required":
      return "This feature needs a Mote Household subscription.";
    case "entitlement_unavailable":
      return "Your Mote Pro status could not be checked just now. Reconnect to the Microsoft Store and try again — nothing you own has been lost.";
  }
}

/** Whether a failure should offer the purchase path rather than a retry. */
export function isPurchaseRequired(error: unknown): boolean {
  return parseAuthorizationError(error)?.code === "pro_required";
}
