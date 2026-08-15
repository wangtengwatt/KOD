import { SUANBAO_IPC_CHANNELS } from '@shared/suanbao-ipc'
import {
  suanbaoCommandSchema,
  suanbaoInteractiveRegionSchema,
  suanbaoOperationIdSchema,
  suanbaoPlacementSchema,
} from '@shared/types/suanbao'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { SuanbaoBroker } from './broker'
import type { SuanbaoWindowManager } from './window'

export interface SuanbaoIpcRegistration {
  dispose(): void
}

export function registerSuanbaoIpcHandlers(
  ipcMain: IpcMain,
  windowManager: SuanbaoWindowManager,
  broker: SuanbaoBroker
): SuanbaoIpcRegistration {
  const channels: string[] = []
  const handle = (channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, listener)
    channels.push(channel)
  }
  const requirePetWindow = (event: IpcMainInvokeEvent) => {
    if (!windowManager.isPetWindowSender(event.sender.id)) throw new Error('SUANBAO_UNAUTHORIZED_SENDER')
  }
  const requireMainWindow = (event: IpcMainInvokeEvent) => {
    if (!windowManager.isMainWindowSender(event.sender.id)) throw new Error('SUANBAO_UNAUTHORIZED_SENDER')
  }
  const requireKnownWindow = (event: IpcMainInvokeEvent) => {
    if (!windowManager.isPetWindowSender(event.sender.id) && !windowManager.isMainWindowSender(event.sender.id)) {
      throw new Error('SUANBAO_UNAUTHORIZED_SENDER')
    }
  }

  handle(SUANBAO_IPC_CHANNELS.getCapabilities, (event) => {
    requireMainWindow(event)
    return windowManager.getCapabilities()
  })

  handle(SUANBAO_IPC_CHANNELS.getBootstrap, (event) => {
    requirePetWindow(event)
    return broker.getBootstrap()
  })
  handle(SUANBAO_IPC_CHANNELS.dispatchCommand, (event, value) => {
    requirePetWindow(event)
    return broker.dispatchCommand(suanbaoCommandSchema.parse(value))
  })
  handle(SUANBAO_IPC_CHANNELS.confirmOperation, (event, value) => {
    requirePetWindow(event)
    return broker.confirmOperation(suanbaoOperationIdSchema.parse(value))
  })
  handle(SUANBAO_IPC_CHANNELS.cancelOperation, (event, value) => {
    requirePetWindow(event)
    return broker.cancelOperation(suanbaoOperationIdSchema.parse(value))
  })
  handle(SUANBAO_IPC_CHANNELS.updatePlacement, (event, value) => {
    requirePetWindow(event)
    return windowManager.updatePlacement(suanbaoPlacementSchema.parse(value))
  })
  handle(SUANBAO_IPC_CHANNELS.setInteractiveRegion, (event, value) => {
    requirePetWindow(event)
    const { interactive } = suanbaoInteractiveRegionSchema.parse(value)
    windowManager.setInteractive(interactive)
  })
  handle(SUANBAO_IPC_CHANNELS.setEnabled, async (event, value) => {
    requireMainWindow(event)
    if (typeof value !== 'boolean') throw new Error('SUANBAO_INVALID_ENABLED_VALUE')
    await windowManager.setEnabled(value)
  })
  handle(SUANBAO_IPC_CHANNELS.show, async (event) => {
    requireKnownWindow(event)
    await windowManager.show()
  })
  handle(SUANBAO_IPC_CHANNELS.hide, (event) => {
    requireKnownWindow(event)
    windowManager.hide()
  })
  handle(SUANBAO_IPC_CHANNELS.minimize, (event) => {
    requirePetWindow(event)
    windowManager.minimize()
  })
  handle(SUANBAO_IPC_CHANNELS.openMainWindow, (event) => {
    requireKnownWindow(event)
    windowManager.openMainWindow()
  })
  handle(SUANBAO_IPC_CHANNELS.publishBootstrap, (event, value) => {
    requireMainWindow(event)
    return broker.publishBootstrap(value)
  })
  handle(SUANBAO_IPC_CHANNELS.publishViewModel, (event, value) => {
    requireMainWindow(event)
    return broker.publishViewModel(value)
  })

  return {
    dispose() {
      for (const channel of channels) ipcMain.removeHandler(channel)
    },
  }
}
