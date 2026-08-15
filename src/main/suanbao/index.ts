import path from 'node:path'
import type { SuanbaoPlacement } from '@shared/types/suanbao'
import type { BrowserWindow, IpcMain } from 'electron'
import { SuanbaoBroker } from './broker'
import { registerSuanbaoIpcHandlers, type SuanbaoIpcRegistration } from './ipc-handlers'
import { resolveSuanbaoPreloadPath, SuanbaoWindowManager } from './window'

export interface SuanbaoDesktopModuleOptions {
  ipcMain: IpcMain
  isPackaged: boolean
  dirname: string
  rendererUrl?: string
  getMainWindow(): BrowserWindow | null
  openMainWindow(): void
  loadPlacement(): unknown
  savePlacement(placement: SuanbaoPlacement): void
}

export interface SuanbaoDesktopModule {
  windowManager: SuanbaoWindowManager
  broker: SuanbaoBroker
  dispose(): void
}

export function createSuanbaoDesktopModule(options: SuanbaoDesktopModuleOptions): SuanbaoDesktopModule {
  const developmentUrl = options.rendererUrl
    ? `${options.rendererUrl.replace(/\/$/, '')}/suanbao-window/index.html`
    : undefined
  const windowManager = new SuanbaoWindowManager({
    getMainWindow: options.getMainWindow,
    preloadPath: resolveSuanbaoPreloadPath(options.isPackaged, options.dirname),
    productionHtmlPath: path.join(options.dirname, '../renderer/suanbao-window/index.html'),
    developmentUrl,
    loadPlacement: options.loadPlacement,
    savePlacement: options.savePlacement,
    openMainWindow: options.openMainWindow,
  })
  const broker = new SuanbaoBroker(windowManager, options.getMainWindow)
  const ipcRegistration: SuanbaoIpcRegistration = registerSuanbaoIpcHandlers(options.ipcMain, windowManager, broker)

  return {
    windowManager,
    broker,
    dispose() {
      ipcRegistration.dispose()
      windowManager.destroy()
    },
  }
}
