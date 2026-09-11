import { describe, expect, test } from "bun:test";
import {
  describeCommandError,
  isPurchaseRequired,
  parseAuthorizationError,
} from "../src/lib/entitlement-errors";

// The gate returns its refusal as JSON inside the error string. Printing that
// raw put {"code":"pro_required",...} in front of customers, so these pin the
// translation rather than the shape.
const REFUSAL =
  '{"code":"pro_required","capability":"global_shortcuts","requiredProduct":"pro"}';

describe("entitlement errors", () => {
  test("recognises a structured refusal in a string or an Error", () => {
    expect(parseAuthorizationError(REFUSAL)?.code).toBe("pro_required");
    expect(parseAuthorizationError(new Error(REFUSAL))?.code).toBe(
      "pro_required",
    );
  });

  test("leaves ordinary failures alone", () => {
    expect(parseAuthorizationError("Bridge is unreachable.")).toBeNull();
    expect(parseAuthorizationError('{"some":"other json"}')).toBeNull();
    expect(parseAuthorizationError(undefined)).toBeNull();
    expect(describeCommandError("Bridge is unreachable.")).toBe(
      "Bridge is unreachable.",
    );
  });

  test("never shows raw JSON to a customer", () => {
    const described = describeCommandError(REFUSAL);
    expect(described).not.toContain("{");
    expect(described).not.toContain("pro_required");
    expect(described).toContain("Mote Pro");
  });

  test("only a pro_required refusal offers a purchase", () => {
    expect(isPurchaseRequired(REFUSAL)).toBe(true);
    expect(
      isPurchaseRequired(
        '{"code":"entitlement_unavailable","capability":"pc_sync","requiredProduct":"pro"}',
      ),
    ).toBe(false);
    expect(isPurchaseRequired("Bridge is unreachable.")).toBe(false);
  });

  test("an unavailable licence tells the customer nothing was lost", () => {
    const described = describeCommandError(
      '{"code":"entitlement_unavailable","capability":"pc_sync","requiredProduct":"pro"}',
    );
    expect(described).toContain("try again");
    expect(described).not.toContain("{");
  });
});
