import type { ElectronIPC } from '@shared/electron-types'
import { SUANBAO_IPC_CHANNELS } from '@shared/suanbao-ipc'
import type { SuanbaoPlatformCapabilities } from '@shared/types/suanbao'
import type { SuanbaoPlatformController } from './interface'

export class DesktopSuanbaoPlatformController implements SuanbaoPlatformController {
  constructor(private readonly ipc: ElectronIPC) {}

  getCapabilities(): Promise<SuanbaoPlatformCapabilities> {
    return this.ipc.invoke(SUANBAO_IPC_CHANNELS.getCapabilities)
  }

  setEnabled(enabled: boolean): Promise<void> {
    return this.ipc.invoke(SUANBAO_IPC_CHANNELS.setEnabled, enabled)
  }

  show(): Promise<void> {
    return this.ipc.invoke(SUANBAO_IPC_CHANNELS.show)
  }

  hide(): Promise<void> {
    return this.ipc.invoke(SUANBAO_IPC_CHANNELS.hide)
  }

  openMainWindow(): Promise<void> {
    return this.ipc.invoke(SUANBAO_IPC_CHANNELS.openMainWindow)
  }
}
