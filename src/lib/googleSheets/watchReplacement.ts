import type { GoogleWorkspaceApi, WatchChannel } from "./api";

export async function replaceWatchSafely(
  api: GoogleWorkspaceApi,
  previous: { channelId: string; resourceId: string; spreadsheetId: string },
  persist: (channel: WatchChannel) => Promise<void>,
) {
  const channel = await api.createWatchChannel({ spreadsheetId: previous.spreadsheetId, resourceId: previous.resourceId });
  try {
    await persist(channel);
  } catch (error) {
    if (api.stopWatchChannel) await api.stopWatchChannel(channel.channelId, channel.resourceId).catch(() => {});
    throw error;
  }
  let cleanupPending = false;
  try {
    if (api.stopWatchChannel) await api.stopWatchChannel(previous.channelId, previous.resourceId);
    else cleanupPending = true;
  } catch { cleanupPending = true; }
  return { channel, cleanupPending };
}
