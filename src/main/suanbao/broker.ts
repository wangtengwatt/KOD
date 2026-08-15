import { randomUUID } from 'node:crypto'
import { SUANBAO_IPC_CHANNELS } from '@shared/suanbao-ipc'
import {
  type SuanbaoBootstrap,
  type SuanbaoCommand,
  type SuanbaoHostRequest,
  type SuanbaoViewModel,
  suanbaoBootstrapSchema,
  suanbaoViewModelSchema,
} from '@shared/types/suanbao'
import type { BrowserWindow } from 'electron'
import type { SuanbaoWindowManager } from './window'

function createOfflineViewModel(): SuanbaoViewModel {
  return {
    revision: 0,
    petState: 'idle',
    bubbleOpen: false,
    message: 'Suanbao host is not connected',
    connection: 'offline',
    updatedAt: Date.now(),
  }
}

export class SuanbaoBroker {
  private viewModel = createOfflineViewModel()
  private hostBootstrap: SuanbaoBootstrap | undefined

  constructor(
    private readonly windowManager: SuanbaoWindowManager,
    private readonly getMainWindow: () => BrowserWindow | null
  ) {}

  getBootstrap(): SuanbaoBootstrap {
    const bootstrap: SuanbaoBootstrap = {
      enabled: this.windowManager.isEnabled(),
      visible: this.windowManager.isVisible(),
      language: 'zh-Hans',
      animation: this.windowManager.getAnimation(),
      placement: this.windowManager.getPlacement(),
      capabilities: this.windowManager.getCapabilities(),
      viewModel: this.viewModel,
      ...this.hostBootstrap,
    }
    bootstrap.placement = this.windowManager.getPlacement()
    bootstrap.capabilities = this.windowManager.getCapabilities()
    bootstrap.enabled = this.windowManager.isEnabled()
    bootstrap.visible = this.windowManager.isVisible()
    return suanbaoBootstrapSchema.parse(bootstrap)
  }

  async publishBootstrap(value: unknown): Promise<SuanbaoBootstrap> {
    const bootstrap = suanbaoBootstrapSchema.parse(value)
    this.hostBootstrap = bootstrap
    this.viewModel = bootstrap.viewModel
    this.windowManager.setAnimation(bootstrap.animation)
    await this.windowManager.setEnabled(bootstrap.enabled)
    this.sendViewModel(this.viewModel)
    return this.getBootstrap()
  }

  publishViewModel(value: unknown): SuanbaoViewModel {
    const next = suanbaoViewModelSchema.parse(value)
    if (next.revision < this.viewModel.revision) return this.viewModel
    this.viewModel = next
    this.sendViewModel(next)
    return next
  }

  dispatchCommand(command: SuanbaoCommand): { accepted: true; requestId: string } {
    const requestId = randomUUID()
    this.sendHostRequest({ kind: 'dispatch-command', requestId, command })
    return { accepted: true, requestId }
  }

  confirmOperation(operationId: string): { accepted: true } {
    this.sendHostRequest({ kind: 'confirm-operation', requestId: randomUUID(), operationId })
    return { accepted: true }
  }

  cancelOperation(operationId: string): { accepted: true } {
    this.sendHostRequest({ kind: 'cancel-operation', requestId: randomUUID(), operationId })
    return { accepted: true }
  }

  private sendHostRequest(request: SuanbaoHostRequest): void {
    const mainWindow = this.getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('SUANBAO_HOST_UNAVAILABLE')
    mainWindow.webContents.send(SUANBAO_IPC_CHANNELS.hostCommand, request)
  }

  private sendViewModel(viewModel: SuanbaoViewModel): void {
    const petWindow = this.windowManager.getWindow()
    if (!petWindow || petWindow.isDestroyed()) return
    petWindow.webContents.send(SUANBAO_IPC_CHANNELS.viewModelChanged, viewModel)
  }
}
