// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ElectronIPC } from 'src/shared/electron-types'
import { SUANBAO_IPC_CHANNELS } from 'src/shared/suanbao-ipc'
import { TINPAY_IPC_CHANNELS, tinpayNotificationSchema } from 'src/shared/tinpay'
import type { SuanbaoHostRequest } from 'src/shared/types/suanbao'

// export type Channels = 'ipc-example';

function createListener<T extends unknown[]>(channel: string) {
  return (callback: (...args: T) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: T) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

const electronHandler: ElectronIPC = {
  invoke: ipcRenderer.invoke,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openPaymentUrl: (url: string) => ipcRenderer.invoke('payment:open-url', url),
  onSystemThemeChange: (callback: () => void) => {
    ipcRenderer.on('system-theme-updated', callback)
    return () => ipcRenderer.off('system-theme-updated', callback)
  },
  onWindowMaximizedChanged: (callback: (_: Electron.IpcRendererEvent, windowMaximized: boolean) => void) => {
    ipcRenderer.on('window:maximized-changed', callback)
    return () => ipcRenderer.off('window:maximized-changed', callback)
  },
  onWindowFocused: (callback: (_: Electron.IpcRendererEvent) => void) => {
    ipcRenderer.on('window:focused', callback)
    return () => ipcRenderer.off('window:focused', callback)
  },
  onWindowShow: (callback: () => void) => {
    ipcRenderer.on('window-show', callback)
    return () => ipcRenderer.off('window-show', callback)
  },
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on('update-downloaded', callback)
    return () => ipcRenderer.off('update-downloaded', callback)
  },
  addMcpStdioTransportEventListener: (transportId: string, event: string, callback?: (...args: any[]) => void) => {
    ipcRenderer.on(`mcp:stdio-transport:${transportId}:${event}`, (_event, ...args) => {
      callback?.(...args)
    })
  },
  onNavigate: (callback: (path: string) => void) => {
    const listener = (_event: unknown, path: string) => {
      callback(path)
    }
    ipcRenderer.on('navigate-to', listener)
    return () => ipcRenderer.off('navigate-to', listener)
  },
  suanbao: {
    publishBootstrap: (bootstrap) => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.publishBootstrap, bootstrap),
    publishViewModel: (viewModel) => ipcRenderer.invoke(SUANBAO_IPC_CHANNELS.publishViewModel, viewModel),
    onCommand: (callback: (request: SuanbaoHostRequest) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, request: SuanbaoHostRequest) => callback(request)
      ipcRenderer.on(SUANBAO_IPC_CHANNELS.hostCommand, listener)
      return () => ipcRenderer.off(SUANBAO_IPC_CHANNELS.hostCommand, listener)
    },
  },
  tinpay: {
    open: (input) => ipcRenderer.invoke(TINPAY_IPC_CHANNELS.open, input),
    close: (input) => ipcRenderer.invoke(TINPAY_IPC_CHANNELS.close, input),
    openExternal: (input) => ipcRenderer.invoke(TINPAY_IPC_CHANNELS.openExternal, input),
    onNotification: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
        const parsed = tinpayNotificationSchema.safeParse(value)
        if (parsed.success) callback(parsed.data)
      }
      ipcRenderer.on(TINPAY_IPC_CHANNELS.notification, listener)
      return () => ipcRenderer.off(TINPAY_IPC_CHANNELS.notification, listener)
    },
  },

  // Auto-updater events
  onUpdaterChecking: createListener('updater:checking'),
  onUpdaterAvailable: createListener('updater:available'),
  onUpdaterNotAvailable: createListener('updater:not-available'),
  onUpdaterProgress: createListener('updater:progress'),
  onUpdaterDownloaded: createListener('updater:downloaded'),
  onUpdaterError: createListener('updater:error'),
}

contextBridge.exposeInMainWorld('electronAPI', electronHandler)
