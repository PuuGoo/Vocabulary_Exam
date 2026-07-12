"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";

export default function SettingsForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [email, setEmail] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then((r) => r.json())
      .then((d) => setEmail(d.email || ""));
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword) return toast("Vui lòng nhập đầy đủ mật khẩu.");
    setSavingPw(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSavingPw(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || "Không thể đổi mật khẩu.");
    toast("Đã đổi mật khẩu thành công!");
    setCurrentPassword("");
    setNewPassword("");
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSavingEmail(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || "Không thể lưu email.");
    toast("Đã lưu email.");
  }

  return (
    <>
      <div className={cx.panel}>
        <h2 className={cx.h2}>Email khôi phục mật khẩu</h2>
        <div className={cx.desc}>
          Nếu bạn quên mật khẩu, liên kết đặt lại sẽ được gửi tới email này (nếu hệ thống đã cấu hình gửi email).
        </div>
        <form onSubmit={saveEmail}>
          <label className={cx.label}>Email</label>
          <input
            type="email"
            className={cx.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@vidu.com"
          />
          <button className={`${cx.btn} ${cx.btnGold}`} disabled={savingEmail}>
            {savingEmail ? "Đang lưu..." : "Lưu email"}
          </button>
        </form>
      </div>

      <div className={cx.panel}>
        <h2 className={cx.h2}>Đổi mật khẩu</h2>
        <form onSubmit={changePassword}>
          <label className={cx.label}>Mật khẩu hiện tại</label>
          <input
            type="password"
            className={cx.input}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <label className={cx.label}>Mật khẩu mới (tối thiểu 6 ký tự)</label>
          <input
            type="password"
            className={cx.input}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button className={`${cx.btn} ${cx.btnGold}`} disabled={savingPw}>
            {savingPw ? "Đang lưu..." : "Đổi mật khẩu"}
          </button>
        </form>
      </div>
    </>
  );
}
