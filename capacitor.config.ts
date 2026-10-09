import type { CapacitorConfig } from '@capacitor/cli';

/** The Android app (branch "android"): the same screens as the website, talking to the live site's server. */
const config: CapacitorConfig = {
  appId: 'app.tradinganis',
  appName: 'Trading',
  webDir: 'build',
  backgroundColor: '#05070f',
  plugins: {
    // Requests go through Android itself (not the web view), so the live server and news feeds answer without CORS limits.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
