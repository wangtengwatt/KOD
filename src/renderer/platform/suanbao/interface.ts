import type { SuanbaoPlatformCapabilities } from '@shared/types/suanbao'

export interface SuanbaoPlatformController {
  getCapabilities(): Promise<SuanbaoPlatformCapabilities>
  setEnabled(enabled: boolean): Promise<void>
  show(): Promise<void>
  hide(): Promise<void>
  openMainWindow(): Promise<void>
}
