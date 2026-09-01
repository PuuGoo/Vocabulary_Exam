import nodemailer from "nodemailer";

const SMTP_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 45_000 } as const;

export type EmailConfigStatus = { configured: boolean; provider: "smtp"; hostConfigured: boolean; port: number | null; userConfigured: boolean; fromConfigured: boolean; error?: string };
type MailError = Error & { code?: string; responseCode?: number };

export function getEmailConfigStatus(): EmailConfigStatus {
  const port = Number(process.env.SMTP_PORT || 587);
  const hostConfigured = Boolean(process.env.SMTP_HOST?.trim());
  const userConfigured = Boolean(process.env.SMTP_USER?.trim());
  const passConfigured = Boolean(process.env.SMTP_PASS);
  const fromConfigured = Boolean(process.env.SMTP_FROM?.trim());
  const portValid = Number.isInteger(port) && port > 0 && port <= 65_535;
  const configured = hostConfigured && userConfigured && passConfigured && fromConfigured && portValid;
  let error: string | undefined;
  if (!hostConfigured) error = "Thiếu SMTP_HOST trên máy chủ.";
  else if (!portValid) error = "SMTP_PORT không hợp lệ (phải từ 1 đến 65535).";
  else if (!userConfigured) error = "Thiếu SMTP_USER trên máy chủ.";
  else if (!passConfigured) error = "Thiếu SMTP_PASS trên máy chủ.";
  else if (!fromConfigured) error = "Thiếu SMTP_FROM trên máy chủ.";
  return { configured, provider: "smtp", hostConfigured, port: portValid ? port : null, userConfigured, fromConfigured, error };
}

function getTransport() {
  const status = getEmailConfigStatus();
  if (!status.configured || status.port === null) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(), port: status.port, secure: status.port === 465,
    auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASS! }, ...SMTP_TIMEOUTS,
  });
}

export function safeSmtpError(error: unknown): string {
  const err = error as MailError;
  const code = String(err?.code || "").toUpperCase();
  const responseCode = Number(err?.responseCode || 0);
  const message = String(err?.message || "").toLowerCase();
  if (code === "EAUTH" || responseCode === 535 || message.includes("authentication")) return "Xác thực SMTP thất bại. Hãy kiểm tra SMTP_USER/SMTP_PASS trên Vercel.";
  if (["EDNS", "ENOTFOUND", "EAI_AGAIN"].includes(code)) return "Không tìm thấy SMTP_HOST. Hãy kiểm tra tên máy chủ SMTP trên Vercel.";
  if (code === "ETIMEDOUT" || message.includes("timeout")) return "Kết nối SMTP quá thời gian chờ. Hãy kiểm tra SMTP_HOST, SMTP_PORT và firewall của nhà cung cấp.";
  if (["ECONNREFUSED", "ECONNRESET"].includes(code)) return "Máy chủ SMTP từ chối kết nối. Hãy kiểm tra SMTP_HOST và SMTP_PORT.";
  if (code === "ESOCKET" || /tls|certificate|ssl/.test(message)) return "Kết nối TLS/SSL tới SMTP thất bại. Hãy kiểm tra port và cấu hình bảo mật của nhà cung cấp.";
  if ([550, 553].includes(responseCode) || message.includes("sender")) return "Địa chỉ người gửi bị máy chủ SMTP từ chối. Hãy kiểm tra SMTP_FROM.";
  if (code === "EENVELOPE" || message.includes("recipient") || responseCode === 551) return "Địa chỉ người nhận bị máy chủ SMTP từ chối.";
  if (responseCode === 552 || /message size|too large/.test(message)) return "Máy chủ SMTP từ chối vì email hoặc file đính kèm quá lớn.";
  return "Gửi email qua SMTP thất bại. Hãy kiểm tra cấu hình và log function trên Vercel.";
}

export async function verifyEmailTransport(): Promise<{ configured: boolean; reachable: boolean; error?: string }> {
  const status = getEmailConfigStatus();
  if (!status.configured) return { configured: false, reachable: false, error: status.error };
  try { await getTransport()!.verify(); return { configured: true, reachable: true }; }
  catch (error) { return { configured: true, reachable: false, error: safeSmtpError(error) }; }
}

export async function sendBackupEmail(options: { to: string; attachment: Buffer; filename: string; createdAt: Date; recordCount: number }): Promise<{ ok: boolean; error?: string }> {
  const status = getEmailConfigStatus();
  const transport = getTransport();
  if (!transport) return { ok: false, error: status.error || "SMTP chưa được cấu hình đầy đủ." };
  try {
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM, to: options.to,
      subject: `Sao lưu Lexora · ${options.createdAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`,
      text: `Bản sao lưu Lexora được tạo lúc ${options.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}. Tổng số bản ghi: ${options.recordCount}. File đã được nén gzip và có checksum SHA-256.`,
      html: `<h2>Sao lưu Lexora</h2><p>Bản sao lưu được tạo lúc <b>${options.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</b>.</p><p>Tổng số bản ghi: <b>${options.recordCount.toLocaleString("vi-VN")}</b>.</p><p>File đính kèm đã được nén gzip và chứa checksum SHA-256.</p>`,
      attachments: [{ filename: options.filename, content: options.attachment, contentType: "application/gzip" }],
    });
    if (info.rejected?.length || !info.accepted?.length) return { ok: false, error: "Địa chỉ người nhận bị máy chủ SMTP từ chối." };
    return { ok: true };
  } catch (error) {
    const safeError = safeSmtpError(error);
    console.error("[backup-email] smtp failed", { code: String((error as MailError)?.code || "UNKNOWN"), error: safeError });
    return { ok: false, error: safeError };
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const transport = getTransport();
  if (!transport) return false;
  try {
    const info = await transport.sendMail({ from: process.env.SMTP_FROM, to, subject: "Đặt lại mật khẩu — IELTS Vocab Check", html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Liên kết hết hạn sau 1 giờ.</p>` });
    return Boolean(info.accepted?.length) && !info.rejected?.length;
  } catch (error) { console.error("sendPasswordResetEmail failed:", error instanceof Error ? error.message : error); return false; }
}

export function isEmailConfigured() { return getEmailConfigStatus().configured; }
