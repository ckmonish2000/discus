import { test, expect, describe } from "bun:test";
import { summariseDocument } from "./invoice-extractor";

/**
 * The contract is that a summary never fails an extraction: it is a
 * nice-to-have field, so every failure path returns null instead of throwing.
 *
 * Both cases here are deterministic and make no successful network call. The
 * previous version asserted "returns null" unconditionally, which only held
 * while GOOGLE_API_KEY was unset — once a key was configured it became a live
 * Gemini request that failed on timing rather than on the contract.
 */
describe("summariseDocument", () => {
  test("returns null when the model call fails", async () => {
    // 1ms guarantees the timeout wins the race, exercising the catch path
    // without depending on whether a key is configured.
    const result = await summariseDocument("# INVOICE", { timeoutMs: 1 });
    expect(result).toBeNull();
  });

  test("does not throw on failure", async () => {
    // The whole point: a failed summary must not propagate and fail an
    // otherwise successful extraction.
    expect(summariseDocument("# INVOICE", { timeoutMs: 1 })).resolves.toBeNull();
  });
});
