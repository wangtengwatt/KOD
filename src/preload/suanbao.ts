import { SUANBAO_IPC_CHANNELS } from '@shared/suanbao-ipc'
import {
  type SuanbaoCommand,
  type SuanbaoPetWindowApi,
  type SuanbaoViewModel,
  suanbaoViewModelSchema,
} from '@shared/types/suanbao'
import { contextBridge, ipcRenderer } from 'electron'

function onValidatedEvent<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

const api: SuanbaoPetWindowApi = {
  getBootstrap: () => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.getBootstrap),
  dispatchCommand: (command: SuanbaoCommand) => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.dispatchCommand, command),
  confirmOperation: (operationId: string) => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.confirmOperation, operationId),
  cancelOperation: (operationId: string) => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.cancelOperation, operationId),
  updatePlacement: (placement) => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.updatePlacement, placement),
  setInteractiveRegion: (input) => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.setInteractiveRegion, input),
  hide: () => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.hide),
  minimize: () => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.minimize),
  openMainWindow: () => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.openMainWindow),
  onViewModelChanged: (listener: (viewModel: SuanbaoViewModel) => void) =>
    onValidatedEvent<unknown>(SUANBAO_IPC_CHANNELS.viewModelChanged, (value) => {
      const parsed = suanbaoViewModelSchema.safeParse(value)
      if (parsed.success) listener(parsed.data)
    }),
  onNotificationClicked: (listener: (entityId: string) => void) =>
    onValidatedEvent(SUANBAO_IPC_CHANNELS.notificationClicked, listener),
}

contextBridge.exposeInMainWorld('suanbaoAPI', api)
