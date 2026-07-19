"use client";

import { useEffect, useState } from "react";

type ThemeSetting = "system" | "light" | "dark";

const themes: Array<{ value: ThemeSetting; icon: string; label: string }> = [
  { value: "system", icon: "◐", label: "Theo hệ thống" },
  { value: "light", icon: "☀", label: "Sáng" },
  { value: "dark", icon: "☾", label: "Tối" },
];

function applyTheme(setting: ThemeSetting) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = setting === "dark" || (setting === "system" && systemDark);
  document.documentElement.classList.toggle("theme-dark", dark);
  document.documentElement.dataset.themeSetting = setting;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export default function ThemeToggle() {
  const [setting, setSetting] = useState<ThemeSetting>("system");

  useEffect(() => {
    const initial = (document.documentElement.dataset.themeSetting as ThemeSetting) || "system";
    setSetting(initial);
    applyTheme(initial);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if ((document.documentElement.dataset.themeSetting || "system") === "system") applyTheme("system"); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function cycle() {
    const currentIndex = themes.findIndex((theme) => theme.value === setting);
    const next = themes[(currentIndex + 1) % themes.length];
    setSetting(next.value);
    window.localStorage.setItem("ivc_theme", next.value);
    applyTheme(next.value);
  }

  const current = themes.find((theme) => theme.value === setting) || themes[0];
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Giao diện: ${current.label}. Bấm để chuyển chế độ.`}
      title={`Giao diện: ${current.label}`}
      className="bg-transparent border border-goldpale/40 text-goldpale px-2.5 sm:px-3 py-1.5 rounded-md text-[0.8rem] hover:border-gold hover:text-gold"
    >
      <span aria-hidden="true">{current.icon}</span><span className="hidden lg:inline"> {current.label}</span>
    </button>
  );
}
