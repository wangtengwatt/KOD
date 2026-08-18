import type { CapacitorConfig } from '@capacitor/cli'

const isLocalAndroidTest = process.env.KOD_ANDROID_LOCAL_TEST === '1'

const config: CapacitorConfig = {
  appId: 'com.kod.app',
  appName: 'KOD',
  webDir: 'release/app/dist/renderer',
  android: {
    allowMixedContent: isLocalAndroidTest,
  },
  server: {
    androidScheme: isLocalAndroidTest ? 'http' : 'https',
    cleartext: isLocalAndroidTest,
  },
}

export default config
