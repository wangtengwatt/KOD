import { registerPlugin } from '@capacitor/core'
import { CHATBOX_BUILD_PLATFORM, CHATBOX_BUILD_TARGET } from '@/variables'
import type { MobileFileLimits, MobileFilePickerKind, MobileFilePickResult } from './file-types'

interface KodFileNative {
  pickFile(options: { kind: MobileFilePickerKind }): Promise<MobileFilePickResult>
  shareFile(options: { token: string }): Promise<{ shared: boolean }>
  revokeFile(options: { token: string }): Promise<{ revoked: boolean }>
  getLimits(): Promise<MobileFileLimits>
}

const native = registerPlugin<KodFileNative>('KodFile')
export function isMobileFilePickerAvailable() { return CHATBOX_BUILD_TARGET === 'mobile_app' && CHATBOX_BUILD_PLATFORM === 'android' }
function requireAndroid() { if (!isMobileFilePickerAvailable()) throw new Error('Mobile file picker is only available in the Android app'); return native }
export const mobileFileNative = {
  pickFile: (kind: MobileFilePickerKind) => requireAndroid().pickFile({ kind }),
  shareFile: (token: string) => requireAndroid().shareFile({ token }),
  revokeFile: (token: string) => requireAndroid().revokeFile({ token }),
  getLimits: () => requireAndroid().getLimits(),
}
