import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jruan.studyos',
  appName: '学序',
  webDir: 'dist-android',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f7f7fa',
  },
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
    SplashScreen: { launchAutoHide: false, backgroundColor: '#f7f7fa', showSpinner: false },
    StatusBar: { backgroundColor: '#f7f7fa', overlaysWebView: false },
  },
};

export default config;
