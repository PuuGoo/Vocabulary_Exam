import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import type { GoogleWorkspaceApi, SheetsValue, SpreadsheetMetadata, WatchChannel } from "@/lib/googleSheets/api";
import { classifyGoogleApiError } from "@/lib/googleSheets/errors";
import { WATCH_CHANNEL_EXPIRATION_MS } from "@/lib/googleSheets/api";

export { WATCH_CHANNEL_EXPIRATION_MS };

const WRITE_CHUNK_ROWS = 2_000;

type TokenInput = { accessToken: string; refreshToken: string | null; expiresAt: Date };

export function webhookBaseUrl(): string {
  const base = process.env.GOOGLE_WEBHOOK_BASE_URL;
  if (!base) throw new Error("GOOGLE_WEBHOOK_BASE_URL is not set.");
  return base.replace(/\/+$/, "");
}

export function createGoogleWorkspaceApi(token: TokenInput): GoogleWorkspaceApi {
  // The OAuth2 client MUST be constructed with the client id/secret/redirect
  // URI. Without them googleapis cannot refresh an expired access token, and
  // every request fails with HTTP 400 invalid_request - even though the stored
  // refresh token itself is perfectly valid.
  const auth = new google.auth.OAuth2({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });
  auth.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken ?? undefined, expiry_date: token.expiresAt.getTime() });
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const api: GoogleWorkspaceApi = {
    async createSpreadsheet({ title, sheetTitle }) {
      try {
        const response = await sheets.spreadsheets.create({
          requestBody: { properties: { title }, sheets: [{ properties: { title: sheetTitle } }] },
          fields: "spreadsheetId,spreadsheetUrl,properties.title,sheets.properties",
        });
        const spreadsheetId = response.data.spreadsheetId;
        const sheet = response.data.sheets?.[0]?.properties;
        if (!spreadsheetId || sheet?.sheetId == null) throw new Error("Google Sheets API không trả về spreadsheet/sheet hợp lệ.");
        return {
          spreadsheetId,
          spreadsheetUrl: response.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          spreadsheetName: response.data.properties?.title || title,
          sheetId: sheet.sheetId,
          sheetTitle: sheet.title || sheetTitle,
        };
      } catch (error) { throw classifyGoogleApiError(error); }
    },

    async addSheet(spreadsheetId, sheetTitle) {
      try {
        const response = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
        });
        const reply = response.data.replies?.[0]?.addSheet?.properties;
        if (!reply?.sheetId) return null;
        return { sheetId: reply.sheetId, title: reply.title || sheetTitle };
      } catch (error) {
        // Best-effort: a missing/dupe tab must never fail spreadsheet creation.
        console.warn("[google-sheets] addSheet skipped:", error instanceof Error ? error.message : "unknown");
        return null;
      }
    },

    async readValues(spreadsheetId, rangeA1, options) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: rangeA1,
          majorDimension: "ROWS",
          // FORMULA is only used by the prompt-application flow so it can tell
          // =AI(...)/=Gemini(...) apart from admin-entered text. The normal
          // vocabulary sync keeps UNFORMATTED_VALUE (materialized text).
          valueRenderOption: options?.renderOption ?? "UNFORMATTED_VALUE",
        });
        return (response.data.values || []) as SheetsValue;
      } catch (error) { throw classifyGoogleApiError(error); }
    },

    async writeValues(spreadsheetId, rangeA1, values, options) {
      if (!values.length) return;
      try {
        // RAW by default so user text is never re-interpreted (a term beginning
        // with "=" would otherwise become a formula). The STT renumbering column
        // opts in via parseFormulas, because it is the only cell that must be
        // stored as a real Sheets formula rather than its text.
        const valueInputOption = options?.parseFormulas ? "USER_ENTERED" : "RAW";
        // One request per chunk keeps 10k+ rows within quota instead of N calls.
        for (let offset = 0; offset < values.length; offset += WRITE_CHUNK_ROWS) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: rangeA1,
            valueInputOption,
            requestBody: { values: values.slice(offset, offset + WRITE_CHUNK_ROWS) },
          });
        }
      } catch (error) { throw classifyGoogleApiError(error); }
    },

    async batchWriteValues(spreadsheetId, updates) {
      if (!updates.length) return;
      try {
        // One values.batchUpdate request replaces one update call per cell.
        // 981 rows x 8 AI columns stays a single request instead of thousands.
        // 981 rows x 8 AI columns stays a single request instead of thousands.
        // USER_ENTERED is mandatory: RAW would store "=AI(...)" as plain text
        // instead of a live formula. This flow only ever writes formula strings.
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: "USER_ENTERED",
            data: updates.map((update) => ({ range: update.rangeA1, values: update.values })),
          },
        });
      } catch (error) { throw classifyGoogleApiError(error); }
    },

    async batchUpdate(spreadsheetId, requests) {
      try {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
      } catch (error) { throw classifyGoogleApiError(error); }
    },

    async getSpreadsheetMetadata(spreadsheetId) {
      try {
        const response = await sheets.spreadsheets.get({ spreadsheetId, fields: "spreadsheetId,spreadsheetUrl,properties.title,sheets.properties" });
        const metadata: SpreadsheetMetadata = { sheets: (response.data.sheets || []).flatMap((sheet) => (sheet.properties?.sheetId != null ? [{ sheetId: sheet.properties.sheetId, title: sheet.properties.title || "" }] : [])) };
        return metadata;
      } catch (error) { throw classifyGoogleApiError(error); }
    },

    async createWatchChannel({ spreadsheetId, resourceId }) {
      try {
        // A cryptographically random token (no OAuth material) is sent as part
        // of the channel definition and echoed back to us as the
        // X-Goog-Channel-Token header on every notification. This is what makes
        // webhook authentication possible — Google does not sign the body.
        const channelToken = randomBytes(32).toString("hex");
        const response = (await drive.files.watch({
          fileId: spreadsheetId,
          supportsAllDrives: true,
          requestBody: {
            // A fresh id per watch: Google requires a unique channel id and
            // dedupes notifications by it, so renewal must never reuse it.
            id: `lexora-${randomBytes(8).toString("hex")}`,
            type: "web_hook",
            address: `${webhookBaseUrl()}/api/webhooks/google-drive`,
            token: channelToken,
            expiration: String(Date.now() + WATCH_CHANNEL_EXPIRATION_MS),
            // Do not set resourceUri here: it is not a valid Channel field for
            // files.watch (the watched resource is the fileId itself).
          },
        })) as unknown as { data: { id?: string | null; resourceId?: string | null; resourceUri?: string | null; expiration?: string | null } };
        const channelId = response.data.id;
        if (!channelId) throw new Error("Google Drive không trả về channel ID.");
        return {
          channelId,
          resourceId: response.data.resourceId || resourceId,
          resourceUri: response.data.resourceUri || "",
          expirationAt: response.data.expiration ? new Date(Number(response.data.expiration)) : null,
          channelToken,
        };
      } catch (error) { throw classifyGoogleApiError(error); }
    },

    async renewWatchChannel({ channelId, spreadsheetId, resourceId }) {
      // Stop the old channel first so Google does not keep notifying a stale id.
      try {
        await drive.channels.stop({ requestBody: { id: channelId, resourceId } });
      } catch {
        // An already-expired channel cannot be stopped; renewal still proceeds.
      }
      return api.createWatchChannel({ spreadsheetId, resourceId });
    },

    async verifyAccess(spreadsheetId) {
      try {
        await sheets.spreadsheets.get({ spreadsheetId, fields: "spreadsheetId" });
        return true;
      } catch { return false; }
    },
  };
  return api;
}
