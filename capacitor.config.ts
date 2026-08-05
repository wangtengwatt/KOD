import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kod.app',
  appName: 'Kod',
  webDir: 'release/app/dist/renderer',
  server: {
    androidScheme: 'https',
  },
}

export default config
