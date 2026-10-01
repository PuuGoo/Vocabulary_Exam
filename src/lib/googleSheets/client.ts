import { google } from "googleapis";
import type { GoogleWorkspaceApi, SheetsValue, SpreadsheetMetadata, WatchChannel } from "@/lib/googleSheets/api";
import { classifyGoogleApiError } from "@/lib/googleSheets/errors";

const WRITE_CHUNK_ROWS = 2_000;
const WATCH_CHANNEL_EXPIRATION_MS = 1000 * 60 * 60 * 6; // Drive watch channels live ~24h; renew well before that.

type TokenInput = { accessToken: string; refreshToken: string | null; expiresAt: Date };

export function webhookBaseUrl(): string {
  const base = process.env.GOOGLE_WEBHOOK_BASE_URL;
  if (!base) throw new Error("GOOGLE_WEBHOOK_BASE_URL is not set.");
  return base.replace(/\/+$/, "");
}

export function createGoogleWorkspaceApi(token: TokenInput): GoogleWorkspaceApi {
  const auth = new google.auth.OAuth2();
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

    async readValues(spreadsheetId, rangeA1) {
      try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: rangeA1, majorDimension: "ROWS", valueRenderOption: "UNFORMATTED_VALUE" });
        return (response.data.values || []) as SheetsValue;
      } catch (error) { throw classifyGoogleApiError(error); }
    },

    async writeValues(spreadsheetId, rangeA1, values) {
      if (!values.length) return;
      try {
        // One request per chunk keeps 10k+ rows within quota instead of N calls.
        for (let offset = 0; offset < values.length; offset += WRITE_CHUNK_ROWS) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: rangeA1,
            valueInputOption: "RAW",
            requestBody: { values: values.slice(offset, offset + WRITE_CHUNK_ROWS) },
          });
        }
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
        const response = (await drive.files.watch({
          fileId: spreadsheetId,
          supportsAllDrives: true,
          requestBody: {
            id: `lexora-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            type: "web_hook",
            address: `${webhookBaseUrl()}/api/webhooks/google-drive`,
            resourceUri: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
            expiration: String(Date.now() + WATCH_CHANNEL_EXPIRATION_MS),
          },
        })) as unknown as { data: { id?: string | null; resourceId?: string | null; resourceUri?: string | null; expiration?: string | null } };
        const channelId = response.data.id;
        if (!channelId) throw new Error("Google Drive không trả về channel ID.");
        return {
          channelId,
          resourceId: response.data.resourceId || resourceId,
          resourceUri: response.data.resourceUri || "",
          expirationAt: response.data.expiration ? new Date(Number(response.data.expiration)) : null,
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

