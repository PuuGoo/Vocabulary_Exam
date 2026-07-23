"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export default function MobileAppBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    document.documentElement.classList.add("lexora-native-app");

    const syncStatusBar = () => {
      const darkMode = document.documentElement.classList.contains("theme-dark");
      void StatusBar.setBackgroundColor({ color: darkMode ? "#171623" : "#F8F8FC" });
      void StatusBar.setStyle({ style: darkMode ? Style.Light : Style.Dark });
    };

    void StatusBar.setOverlaysWebView({ overlay: false });
    syncStatusBar();
    void SplashScreen.hide();

    let removeBackListener: (() => Promise<void>) | undefined;
    let disposed = false;
    const themeObserver = new MutationObserver(syncStatusBar);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    void App.addListener("backButton", ({ canGoBack }) => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement?.matches("input, textarea, select, [contenteditable=\"true\"]")) {
        activeElement.blur();
        return;
      }

      const openDialog = document.querySelector<HTMLElement>('[role="dialog"]');
      if (openDialog) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        return;
      }

      if (canGoBack) {
        window.history.back();
        return;
      }

      void App.exitApp();
    }).then((listener) => {
      if (disposed) {
        void listener.remove();
      } else {
        removeBackListener = () => listener.remove();
      }
    });

    return () => {
      disposed = true;
      themeObserver.disconnect();
      document.documentElement.classList.remove("lexora-native-app");
      void removeBackListener?.();
    };
  }, []);

  return null;
}
