export type GoogleSheetsErrorCode =
  | "NOT_CONFIGURED"
  | "OAUTH_REQUIRED"
  | "OAUTH_REVOKED"
  | "PERMISSION_DENIED"
  | "SHEET_NOT_FOUND"
  | "INVALID_RANGE"
  | "INVALID_SCHEMA"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK"
  | "UNKNOWN";

export class GoogleSheetsError extends Error {
  readonly code: GoogleSheetsErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, code: GoogleSheetsErrorCode, options?: { retryable?: boolean; status?: number }) {
    super(message);
    this.name = "GoogleSheetsError";
    this.code = code;
    this.retryable = options?.retryable ?? isRetryableCode(code);
    this.status = options?.status;
  }
}

export function isRetryableCode(code: GoogleSheetsErrorCode): boolean {
  return ["RATE_LIMITED", "TIMEOUT", "NETWORK"].includes(code);
}

/**
 * Translate a Google API failure into a classified error. Retryable:
 * timeouts / transient 5xx / rate limits / network. Non-retryable: revoked
 * OAuth, permission denied, missing spreadsheet, invalid request.
 */
export function classifyGoogleApiError(error: unknown): GoogleSheetsError {
  if (error instanceof GoogleSheetsError) return error;
  const status = readStatus(error);
  const message = readMessage(error) || "Google API request failed.";
  if (status === 401) return new GoogleSheetsError(message, "OAUTH_REVOKED", { status });
  if (status === 403) {
    const lower = message.toLowerCase();
    if (lower.includes("rate") || lower.includes("quota")) return new GoogleSheetsError(message, "RATE_LIMITED", { status });
    return new GoogleSheetsError(message, "PERMISSION_DENIED", { status });
  }
  if (status === 404) return new GoogleSheetsError(message, "SHEET_NOT_FOUND", { status });
  if (status === 429) return new GoogleSheetsError(message, "RATE_LIMITED", { status });
  if (status !== undefined && status >= 500) return new GoogleSheetsError(message, "TIMEOUT", { status });
  if (status !== undefined && status === 400) return new GoogleSheetsError(message, "INVALID_SCHEMA", { status });
  if (status === undefined) return new GoogleSheetsError(message, "NETWORK");
  return new GoogleSheetsError(message, "UNKNOWN", { status });
}

function readRecord(error: unknown): Record<string, unknown> {
  return error && typeof error === "object" ? error as Record<string, unknown> : {};
}

function readStatus(error: unknown): number | undefined {
  const record = readRecord(error);
  const candidates = [record.status, record.code, readRecord(record.response).status, readRecord(record.error).code];
  for (const candidate of candidates) {
    const parsed = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function readMessage(error: unknown): string {
  const record = readRecord(error);
  if (typeof record.message === "string" && record.message) return record.message;
  const nested = readRecord(record.error);
  if (typeof nested.message === "string" && nested.message) return nested.message;
  const responseBody = readRecord(record.response).data;
  const bodyError = readRecord(responseBody).error;
  if (typeof readRecord(bodyError).message === "string" && readRecord(bodyError).message) return readRecord(bodyError).message as string;
  return "";
}

/** Log-safe rendering: never includes request headers or tokens. */
export function safeGoogleErrorForLogs(error: unknown): string {
  if (error instanceof GoogleSheetsError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
