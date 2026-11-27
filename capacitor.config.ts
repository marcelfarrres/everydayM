import type { CapacitorConfig } from '@capacitor/cli';

/*
 * The iPhone app is a native shell around the web app: it opens the site, so changes to the web
 * (photos, texts, design, new routines) reach the app at once, without a new App Store version.
 * Only native changes (icon, name, plugins) need a new build.
 *
 * CAP_SERVER_URL: the public https address, for the App Store build
 *   CAP_SERVER_URL=https://tu-dominio npx cap sync ios
 * Without it, the app opens the computer on the home WiFi (to try it in the simulator or phone).
 */
const url = process.env.CAP_SERVER_URL ?? 'http://192.168.1.37:3000';

const config: CapacitorConfig = {
  appId: 'com.everydaym.app',
  appName: 'Be a Rocket',
  webDir: 'mobile/www', // only the "no connection" page; the app itself comes from `url`
  backgroundColor: '#e9e9e7',
  server: { url, errorPath: 'index.html' },
  ios: { contentInset: 'never', backgroundColor: '#e9e9e7' },
};

export default config;
