import { randomBytes } from "node:crypto";

export type SheetsValue = (string | number | boolean | null)[][];

/**
 * `UNFORMATTED_VALUE` returns generated text, which is what the vocabulary
 * sync needs. `FORMULA` returns the raw formula source, which is required when
 * deciding whether a cell is an AI-managed formula or admin-entered text.
 */
export type SheetsRenderOption = "UNFORMATTED_VALUE" | "FORMULA";

export type SheetsBatchValueUpdate = {
  rangeA1: string;
  values: SheetsValue;
  parseFormulas?: boolean;
};

export type SpreadsheetSummary = { spreadsheetId: string; spreadsheetUrl: string; spreadsheetName: string };
export type CreatedSpreadsheet = SpreadsheetSummary & { sheetId: number; sheetTitle: string };
export type WatchChannel = {
  channelId: string;
  resourceId: string;
  resourceUri: string;
  expirationAt: Date | null;
  /**
   * Raw channel token sent to Google as `token`. Google echoes it back in
   * the X-Goog-Channel-Token header. Only a SHA-256 digest is persisted; this
   * value stays in memory for the create/renew call and is never logged.
   */
  channelToken?: string;
};
export type SpreadsheetMetadata = { sheets: Array<{ sheetId: number; title: string }> };

/**
 * Drive watch channels are documented to live ~24h, so we ask for 23h: close
 * enough to the maximum to be useful, with an hour of slack.
 *
 * A 6h lifetime (the previous value) combined with a once-a-day cron — the
 * Vercel Hobby limit — left every connection silently un-notified for most of
 * each day. Even 22h is not safe on its own: a channel created just after the
 * daily cron runs would expire before the next one. That is why the webhook
 * also renews a channel lazily when it sees one that is close to expiring.
 */
export const WATCH_CHANNEL_EXPIRATION_MS = 1000 * 60 * 60 * 23;

/**
 * A channel is renewed lazily when it has less than this much life left, and
 * by the daily cron on the same condition. It is comfortably larger than the
 * daily cron interval so a channel is never left to expire unattended.
 */
export const WATCH_CHANNEL_RENEW_THRESHOLD_MS = 1000 * 60 * 60 * 6;

/** Thin, testable abstraction over the Google Sheets + Drive APIs. */
export type GoogleWorkspaceApi = {
  createSpreadsheet(options: { title: string; sheetTitle: string }): Promise<CreatedSpreadsheet>;
  readValues(spreadsheetId: string, rangeA1: string, options?: { renderOption?: SheetsRenderOption }): Promise<SheetsValue>;
  writeValues(spreadsheetId: string, rangeA1: string, values: SheetsValue, options?: { parseFormulas?: boolean }): Promise<void>;
  /**
   * Optional single-request multi-range write. Callers must degrade to
   * `writeValues` when an older/fake API object does not provide it.
   */
  batchWriteValues?: (spreadsheetId: string, updates: readonly SheetsBatchValueUpdate[]) => Promise<void>;
  batchUpdate(spreadsheetId: string, requests: Record<string, unknown>[]): Promise<void>;
  getSpreadsheetMetadata(spreadsheetId: string): Promise<SpreadsheetMetadata>;
  createWatchChannel(options: { spreadsheetId: string; resourceId: string }): Promise<WatchChannel>;
  renewWatchChannel(options: { channelId: string; spreadsheetId: string; resourceId: string }): Promise<WatchChannel>;
  verifyAccess(spreadsheetId: string): Promise<boolean>;
  /** Optional: add a new tab (used for the AI help sheet). Degrades gracefully. */
  addSheet?: (spreadsheetId: string, sheetTitle: string) => Promise<{ sheetId: number; title: string } | null>;
};

export type GoogleWorkspaceApiFactory = (token: { accessToken: string; refreshToken: string | null; expiresAt: Date }) => GoogleWorkspaceApi;

/** In-memory fake used by integration tests; never used at runtime. */
export function createFakeGoogleWorkspaceApi(overrides: Partial<GoogleWorkspaceApi> = {}): FakeGoogleWorkspaceApi {
  const store = new Map<string, { values: SheetsValue; metadata: SpreadsheetMetadata; watches: WatchChannel[]; writes: number }>();
  function ensure(spreadsheetId: string) {
    let entry = store.get(spreadsheetId);
    if (!entry) {
      entry = { values: [], metadata: { sheets: [{ sheetId: 0, title: "Sheet1" }] }, watches: [], writes: 0 };
      store.set(spreadsheetId, entry);
    }
    return entry;
  }
  const base: GoogleWorkspaceApi = {
    createSpreadsheet: async ({ title, sheetTitle }) => {
      const spreadsheetId = `fake-sheet-${store.size + 1}`;
      const entry = ensure(spreadsheetId);
      entry.metadata = { sheets: [{ sheetId: 0, title: sheetTitle }] };
      return { spreadsheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, spreadsheetName: title, sheetId: 0, sheetTitle };
    },
    readValues: async (spreadsheetId, _rangeA1, _options) => ensure(spreadsheetId).values.map((row) => [...row]),
    writeValues: async (spreadsheetId, rangeA1, values, _options) => {
      const entry = ensure(spreadsheetId);
      entry.writes += 1;
      // Parse an A1 range such as Sheet1!A1:P4 into an absolute start cell.
      const cell = rangeA1.match(/!\s*([A-Z]+)(\d+)/i);
      const startColumn = cell ? columnIndexFromLetter(cell[1].toUpperCase()) : 0;
      const startRow = cell ? Number(cell[2]) - 1 : 0;
      const next = entry.values.map((row) => [...row]);
      values.forEach((row, rowOffset) => {
        const target = Math.max(0, startRow + rowOffset);
        while (next.length <= target) next.push([]);
        const current = next[target];
        row.forEach((cellValue, columnOffset) => { current[Math.max(0, startColumn + columnOffset)] = cellValue; });
      });
      entry.values = next;
    },
    batchWriteValues: async (spreadsheetId, updates) => {
      for (const update of updates) await base.writeValues(spreadsheetId, update.rangeA1, update.values, { parseFormulas: update.parseFormulas });
    },
    batchUpdate: async () => undefined,
    getSpreadsheetMetadata: async (spreadsheetId) => ({ sheets: ensure(spreadsheetId).metadata.sheets.map((sheet) => ({ ...sheet })) }),
    createWatchChannel: async ({ spreadsheetId, resourceId }) => {
      const entry = ensure(spreadsheetId);
      const channelToken = randomBytes(32).toString("hex");
      const channel: WatchChannel = { channelId: `fake-channel-${entry.watches.length + 1}`, resourceId, resourceUri: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`, expirationAt: new Date(Date.now() + WATCH_CHANNEL_EXPIRATION_MS), channelToken };
      entry.watches.push(channel);
      return channel;
    },
    renewWatchChannel: async ({ channelId, spreadsheetId, resourceId }) => {
      const entry = ensure(spreadsheetId);
      const previous = entry.watches.find((watch) => watch.channelId === channelId);
      const renewed: WatchChannel = { channelId: `fake-channel-${entry.watches.length + 1}`, resourceId, resourceUri: previous?.resourceUri ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`, expirationAt: new Date(Date.now() + WATCH_CHANNEL_EXPIRATION_MS), channelToken: randomBytes(32).toString("hex") };
      entry.watches.push(renewed);
      return renewed;
    },
    verifyAccess: async (spreadsheetId) => store.has(spreadsheetId),
  };
  const api: FakeGoogleWorkspaceApi = {
    ...base,
    ...overrides,
    __inspect: (spreadsheetId: string) => {
      const entry = store.get(spreadsheetId);
      return entry ? { values: entry.values.map((row) => [...row]), writes: entry.writes, watches: [...entry.watches] } : null;
    },
  };
  return api;
}

function columnIndexFromLetter(letters: string): number {
  let index = 0;
  for (const character of letters) index = index * 26 + (character.charCodeAt(0) - 64);
  return index - 1;
}

/** Test-only inspection hook for the in-memory fake. */
export type FakeGoogleWorkspaceApi = GoogleWorkspaceApi & {
  __inspect: (spreadsheetId: string) => { values: SheetsValue; writes: number; watches: WatchChannel[] } | null;
};
