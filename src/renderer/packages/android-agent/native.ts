import { registerPlugin } from '@capacitor/core'
import { CHATBOX_BUILD_PLATFORM, CHATBOX_BUILD_TARGET } from '@/variables'

export type AllowedAndroidApp = {
  id: 'wechat' | 'qq'
  packageName: string
  installed: boolean
}

export type AndroidUiNode = {
  text: string
  description: string
  viewId: string
  className: string
  clickable: boolean
  editable: boolean
  scrollable: boolean
}

export type AndroidSelector = {
  text?: string
  description?: string
  viewId?: string
}

type AndroidAgentNative = {
  listAllowedApps(): Promise<{ apps: AllowedAndroidApp[] }>
  openApp(options: { appId: AllowedAndroidApp['id'] }): Promise<void>
  getAccessibilityStatus(): Promise<{ enabled: boolean }>
  openAccessibilitySettings(): Promise<void>
  getForegroundApp(): Promise<{ packageName?: string; allowed: boolean }>
  readUiTree(options: { limit?: number }): Promise<{ packageName: string; nodes: AndroidUiNode[] }>
  clickElement(options: AndroidSelector): Promise<{ success: boolean; message: string; matchCount: number }>
  inputText(
    options: AndroidSelector & { value: string }
  ): Promise<{ success: boolean; message: string; matchCount: number }>
  scroll(options: { direction: 'forward' | 'backward' }): Promise<{ success: boolean }>
  back(): Promise<{ success: boolean }>
}

const nativeAgent = registerPlugin<AndroidAgentNative>('AndroidAgent')

export function isAndroidAgentAvailable() {
  return CHATBOX_BUILD_TARGET === 'mobile_app' && CHATBOX_BUILD_PLATFORM === 'android'
}

function requireAndroid() {
  if (!isAndroidAgentAvailable()) throw new Error('Android agent is only available in the Android app')
  return nativeAgent
}

export const androidAgentNative = {
  listAllowedApps: () => requireAndroid().listAllowedApps(),
  openApp: (appId: AllowedAndroidApp['id']) => requireAndroid().openApp({ appId }),
  getAccessibilityStatus: () => requireAndroid().getAccessibilityStatus(),
  openAccessibilitySettings: () => requireAndroid().openAccessibilitySettings(),
  getForegroundApp: () => requireAndroid().getForegroundApp(),
  readUiTree: (limit = 80) => requireAndroid().readUiTree({ limit }),
  clickElement: (selector: AndroidSelector) => requireAndroid().clickElement(selector),
  inputText: (selector: AndroidSelector, value: string) => requireAndroid().inputText({ ...selector, value }),
  scroll: (direction: 'forward' | 'backward') => requireAndroid().scroll({ direction }),
  back: () => requireAndroid().back(),
}
