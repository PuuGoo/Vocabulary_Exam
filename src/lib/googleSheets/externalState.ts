import { GoogleSheetsError } from "./errors";

export function externalFailureState(error: unknown) {
  if (!(error instanceof GoogleSheetsError)) return {};
  if (error.code === "SHEET_NOT_FOUND") return { externalState: "missing", enabled: false, status: "missing" };
  if (error.code === "PERMISSION_DENIED") return { externalState: "permission_denied", enabled: false, status: "error" };
  if (error.code === "OAUTH_REVOKED" || error.code === "OAUTH_REQUIRED") return { externalState: "unknown", enabled: false, status: "error" };
  return {};
}
