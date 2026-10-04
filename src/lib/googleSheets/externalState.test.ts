import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { classifyGoogleApiError, GoogleSheetsError } from "./errors";
import { externalFailureState } from "./externalState";

test("permission denial is never classified as deletion", () => {
  assert.deepEqual(externalFailureState(classifyGoogleApiError({ status: 403, message: "Forbidden" })), { externalState: "permission_denied", enabled: false, status: "error" });
  assert.deepEqual(externalFailureState(classifyGoogleApiError({ status: 404 })), { externalState: "missing", enabled: false, status: "missing" });
});

test("OAuth failure and transient failures do not assert that the file is gone", () => {
  assert.equal(externalFailureState(new GoogleSheetsError("revoked", "OAUTH_REVOKED")).externalState, "unknown");
  assert.deepEqual(externalFailureState(new GoogleSheetsError("retry", "RATE_LIMITED")), {});
  assert.deepEqual(externalFailureState(new Error("network")), {});
});

test("recovery uses classified metadata errors and the original tab identity", () => {
  const source = readFileSync("src/lib/googleSheets/recovery.ts", "utf8");
  assert.doesNotMatch(source, /api.verifyAccess|metadata.sheets\[0\]/);
  assert.match(source, /sheet.sheetId === connection.sheetId/);
  assert.match(source, /externalFailureState\(error\)/);
});
