import type { CapacitorConfig } from '@capacitor/cli'

const androidEnvironment = process.env.KOD_ANDROID_ENV || 'production'
if (androidEnvironment !== 'production' && androidEnvironment !== 'localtest') {
  throw new Error('KOD_ANDROID_ENV must be production or localtest')
}

const isLocalAndroidTest = androidEnvironment === 'localtest'

const config: CapacitorConfig = {
  appId: isLocalAndroidTest ? 'com.kod.app.localtest' : 'com.kod.app',
  appName: isLocalAndroidTest ? 'KOD 本地测试' : 'KOD',
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
