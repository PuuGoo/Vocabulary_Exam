export const MAX_EMAIL_ATTACHMENT_BYTES = 18 * 1024 * 1024;

export function backupAttachmentError(byteLength: number) {
  return byteLength > MAX_EMAIL_ATTACHMENT_BYTES
    ? `Bản sao lưu sau khi nén vượt giới hạn 18 MB (${(byteLength / 1024 / 1024).toFixed(1)} MB). Hãy tải thủ công hoặc dùng lưu trữ đám mây.`
    : null;
}
