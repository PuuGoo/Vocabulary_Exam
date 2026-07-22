import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL || "http://10.0.2.2:3000";
const isLocalServer = /^http:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)(:\d+)?/.test(serverUrl);

const config: CapacitorConfig = {
  appId: "vn.lexora.ielts",
  appName: "Lexora IELTS",
  webDir: "mobile-shell",
  server: {
    url: serverUrl,
    cleartext: isLocalServer,
  },
  android: {
    allowMixedContent: isLocalServer,
    backgroundColor: "#F8F8FC",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#F8F8FC",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: "#F8F8FC",
      style: "DARK",
    },
  },
};

export default config;
