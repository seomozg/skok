import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.skok.arcade',
  appName: 'Skok',
  webDir: 'dist',
  android: {
    // Ресурсы приложения (модель MediaPipe) лежат внутри APK — работает офлайн.
    allowMixedContent: false,
  },
  server: {
    // hostname=localhost даёт secure context: getUserMedia в WebView работает.
    hostname: 'localhost',
    androidScheme: 'https',
  },
};

export default config;
