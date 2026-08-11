import type { ElectronIPC } from '@shared/electron-types'
import type { SuanbaoBootstrap, SuanbaoHostRequest, SuanbaoViewModel } from '@shared/types/suanbao'
import { suanbaoHostRequestSchema } from '@shared/types/suanbao'

export interface SuanbaoHostBridge {
  publishBootstrap(bootstrap: SuanbaoBootstrap): Promise<SuanbaoBootstrap>
  publishViewModel(viewModel: SuanbaoViewModel): Promise<SuanbaoViewModel>
  subscribe(listener: (request: SuanbaoHostRequest) => void): () => void
}

class ElectronSuanbaoHostBridge implements SuanbaoHostBridge {
  constructor(private readonly ipc: ElectronIPC) {}

  publishBootstrap(bootstrap: SuanbaoBootstrap): Promise<SuanbaoBootstrap> {
    const api = this.requireApi()
    return api.publishBootstrap(bootstrap)
  }

  publishViewModel(viewModel: SuanbaoViewModel): Promise<SuanbaoViewModel> {
    const api = this.requireApi()
    return api.publishViewModel(viewModel)
  }

  subscribe(listener: (request: SuanbaoHostRequest) => void): () => void {
    const api = this.requireApi()
    return api.onCommand((value) => {
      const parsed = suanbaoHostRequestSchema.safeParse(value)
      if (parsed.success) listener(parsed.data)
    })
  }

  private requireApi() {
    if (!this.ipc.suanbao) throw new Error('SUANBAO_HOST_BRIDGE_UNAVAILABLE')
    return this.ipc.suanbao
  }
}

export function createSuanbaoHostBridge(ipc: ElectronIPC | undefined): SuanbaoHostBridge | null {
  if (!ipc?.suanbao) return null
  return new ElectronSuanbaoHostBridge(ipc)
}
