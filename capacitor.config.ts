import type { CapacitorConfig } from '@capacitor/cli';

// Android (and iOS-ready) wrapper around the web desktop.
// The opencode bridge runs on a PC in the same network — its URL is entered in the opencode window (⚙).
const config: CapacitorConfig = {
  appId: 'com.bigpickle.nebulaos',
  appName: 'Nebula OS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // allow http://<pc-ip>:8787 bridge calls from the https app origin
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0b1220',
  },
};

export default config;
