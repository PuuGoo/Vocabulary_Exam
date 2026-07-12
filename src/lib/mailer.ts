import nodemailer from "nodemailer";

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const transport = getTransport();
  if (!transport) return false;
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: "Đặt lại mật khẩu — IELTS Vocab Check",
      html: `
        <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản IELTS Vocab Check.</p>
        <p>Bấm vào liên kết sau để đặt mật khẩu mới (hết hạn sau 1 giờ):</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
      `,
    });
    return true;
  } catch (err) {
    // Never let an SMTP failure (bad credentials, timeout, etc.) crash the request.
    // The reset token is already saved in the database — admin can still issue a manual reset link.
    console.error("sendPasswordResetEmail failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
