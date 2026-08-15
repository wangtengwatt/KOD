import path from 'node:path'
import type { SuanbaoAnimationLevel, SuanbaoPlacement, SuanbaoPlatformCapabilities } from '@shared/types/suanbao'
import { suanbaoPlacementSchema } from '@shared/types/suanbao'
import { BrowserWindow, screen } from 'electron'
import log from 'electron-log/main'
import { clampDesktopPlacement, defaultDesktopPlacement, type SuanbaoDisplaySnapshot } from './placement'

/** Compact desktop pet; only shown while the main Kod window is hidden. */
const PET_WINDOW_SIZE = { width: 120, height: 145 }
const SAVE_DELAY_MS = 150

export interface SuanbaoWindowManagerOptions {
  getMainWindow(): BrowserWindow | null
  preloadPath: string
  productionHtmlPath: string
  developmentUrl?: string
  loadPlacement(): unknown
  savePlacement(placement: SuanbaoPlacement): void
  openMainWindow(): void
}

function getDisplaySnapshots(): SuanbaoDisplaySnapshot[] {
  const primaryId = String(screen.getPrimaryDisplay().id)
  return screen.getAllDisplays().map((display) => ({
    id: String(display.id),
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    primary: String(display.id) === primaryId,
  }))
}

export class SuanbaoWindowManager {
  private petWindow: BrowserWindow | null = null
  private windowCreation: Promise<BrowserWindow> | null = null
  private enabled = false
  private animation: SuanbaoAnimationLevel = 'off'
  private placement: SuanbaoPlacement
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private disposing = false
  private readonly displayChanged = () => this.restorePlacement()

  constructor(private readonly options: SuanbaoWindowManagerOptions) {
    const parsedPlacement = suanbaoPlacementSchema.safeParse(options.loadPlacement())
    this.placement = parsedPlacement.success ? parsedPlacement.data : defaultDesktopPlacement()

    screen.on('display-added', this.displayChanged)
    screen.on('display-removed', this.displayChanged)
    screen.on('display-metrics-changed', this.displayChanged)
  }

  getCapabilities(): SuanbaoPlatformCapabilities {
    return {
      overlay: 'desktop-window',
      notifications: true,
      backgroundScheduling: 'foreground-only',
      geolocation: false,
      systemCalendarRead: false,
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  isVisible(): boolean {
    return this.petWindow?.isVisible() ?? false
  }

  shouldKeepMainRendererAlive(): boolean {
    return this.enabled
  }

  getAnimation(): SuanbaoAnimationLevel {
    return this.animation
  }

  setAnimation(animation: SuanbaoAnimationLevel): void {
    this.animation = animation
  }

  getPlacement(): SuanbaoPlacement {
    return { ...this.placement }
  }

  getWindow(): BrowserWindow | null {
    return this.petWindow
  }

  isPetWindowSender(webContentsId: number): boolean {
    return this.petWindow?.webContents.id === webContentsId
  }

  isMainWindowSender(webContentsId: number): boolean {
    return this.options.getMainWindow()?.webContents.id === webContentsId
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    await this.syncFloatingVisibility()
  }

  /** Renderer "show" means sync: floating pet only appears when the main window is not on screen. */
  async show(): Promise<void> {
    await this.syncFloatingVisibility()
  }

  hide(): void {
    const window = this.petWindow
    if (!window || window.isDestroyed()) return
    // On Windows, a transparent frameless BrowserWindow can lose its rendered
    // surface after hide() followed by showInactive(). Recreate it next time
    // instead of leaving a visible but empty desktop widget.
    window.hide()
    this.petWindow = null
    // Destroy on the next event-loop turn so an IPC invoke from this window
    // can resolve before its WebContents exits.
    setTimeout(() => {
      if (!window.isDestroyed()) window.destroy()
    }, 0)
  }

  minimize(): void {
    const window = this.petWindow
    if (!window || window.isDestroyed()) return
    window.minimize()
  }

  /** Keep the floating pet for tray/minimized mode; the main window renders the in-app pet. */
  async syncFloatingVisibility(): Promise<void> {
    if (!this.enabled || !this.shouldShowFloating()) {
      this.hide()
      return
    }
    const window = await this.ensureWindow()
    if (!this.enabled || !this.shouldShowFloating()) {
      this.hide()
      return
    }
    this.restorePlacement()
    if (process.platform === 'win32') window.setIgnoreMouseEvents(false)
    if (!window.isVisible()) window.showInactive()
  }

  private shouldShowFloating(): boolean {
    const main = this.options.getMainWindow()
    if (!main || main.isDestroyed()) return false
    return !main.isVisible() || main.isMinimized()
  }

  async toggleFromTray(): Promise<void> {
    if (!this.enabled) this.enabled = true
    const window = await this.ensureWindow()
    if (window.isMinimized()) {
      window.restore()
      window.show()
      window.focus()
      return
    }
    if (window.isVisible()) {
      window.hide()
      return
    }
    this.restorePlacement()
    window.show()
    window.focus()
  }

  setInteractive(interactive: boolean): void {
    const window = this.petWindow
    if (!window || window.isDestroyed()) return
    if (process.platform === 'win32') {
      // Windows does not reliably forward pointer-enter events after a
      // transparent window becomes click-through. Keep this compact window
      // interactive so the mascot and its action buttons stay reachable.
      window.setIgnoreMouseEvents(false)
      return
    }
    window.setIgnoreMouseEvents(!interactive, { forward: true })
  }

  updatePlacement(nextPlacement: SuanbaoPlacement): SuanbaoPlacement {
    const parsed = suanbaoPlacementSchema.parse(nextPlacement)
    this.placement = clampDesktopPlacement(parsed, getDisplaySnapshots(), PET_WINDOW_SIZE)
    this.petWindow?.setBounds({
      x: this.placement.x,
      y: this.placement.y,
      width: PET_WINDOW_SIZE.width,
      height: PET_WINDOW_SIZE.height,
    })
    this.scheduleSave()
    return this.getPlacement()
  }

  restorePlacement(): void {
    this.placement = clampDesktopPlacement(this.placement, getDisplaySnapshots(), PET_WINDOW_SIZE)
    this.petWindow?.setBounds({
      x: this.placement.x,
      y: this.placement.y,
      width: PET_WINDOW_SIZE.width,
      height: PET_WINDOW_SIZE.height,
    })
    this.scheduleSave()
  }

  openMainWindow(): void {
    this.options.openMainWindow()
  }

  destroy(): void {
    this.disposing = true
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.options.savePlacement(this.placement)
    screen.off('display-added', this.displayChanged)
    screen.off('display-removed', this.displayChanged)
    screen.off('display-metrics-changed', this.displayChanged)
    this.petWindow?.destroy()
    this.petWindow = null
  }

  private async ensureWindow(): Promise<BrowserWindow> {
    if (this.petWindow && !this.petWindow.isDestroyed()) return this.petWindow
    if (this.windowCreation) return this.windowCreation

    this.windowCreation = this.createWindow()
    try {
      return await this.windowCreation
    } finally {
      this.windowCreation = null
    }
  }

  private async createWindow(): Promise<BrowserWindow> {
    this.restorePlacement()
    const window = new BrowserWindow({
      width: PET_WINDOW_SIZE.width,
      height: PET_WINDOW_SIZE.height,
      x: this.placement.x,
      y: this.placement.y,
      transparent: true,
      frame: false,
      resizable: false,
      show: false,
      skipTaskbar: false,
      minimizable: true,
      alwaysOnTop: true,
      focusable: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        // electron-vite emits a shared preload chunk. Sandboxed preload
        // scripts cannot require it, which leaves window.suanbaoAPI missing.
        sandbox: false,
        webSecurity: true,
        preload: this.options.preloadPath,
      },
    })

    this.petWindow = window
    window.setMenuBarVisibility(false)
    window.setAlwaysOnTop(true, 'floating')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.on('will-attach-webview', (event) => event.preventDefault())
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      log.error('[Suanbao] Pet renderer failed to load.', { errorCode, errorDescription, validatedURL })
    })
    window.webContents.on('preload-error', (_event, preloadPath, error) => {
      log.error('[Suanbao] Pet preload failed.', { preloadPath, error })
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      log.error('[Suanbao] Pet renderer process exited.', details)
    })
    window.webContents.on('devtools-opened', () => {
      window.webContents.closeDevTools()
    })
    window.on('close', (event) => {
      if (this.disposing) return
      event.preventDefault()
      window.hide()
    })
    window.on('closed', () => {
      if (this.petWindow === window) this.petWindow = null
    })
    window.on('move', () => this.captureCurrentBounds())

    try {
      log.info('[Suanbao] Loading transparent pet window.', {
        source: this.options.developmentUrl ?? this.options.productionHtmlPath,
        placement: this.placement,
      })
      if (this.options.developmentUrl) await window.loadURL(this.options.developmentUrl)
      else await window.loadFile(this.options.productionHtmlPath)
    } catch (error) {
      log.error('[Suanbao] Failed to load pet window:', error)
      window.destroy()
      throw error
    }

    return window
  }

  private captureCurrentBounds(): void {
    if (!this.petWindow || this.petWindow.isDestroyed()) return
    const bounds = this.petWindow.getBounds()
    this.placement = clampDesktopPlacement(
      { ...this.placement, x: bounds.x, y: bounds.y, anchor: 'free' },
      getDisplaySnapshots(),
      PET_WINDOW_SIZE
    )
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.options.savePlacement(this.placement)
      this.saveTimer = undefined
    }, SAVE_DELAY_MS)
  }
}

export function resolveSuanbaoPreloadPath(isPackaged: boolean, dirname: string): string {
  return isPackaged ? path.join(dirname, '../preload/suanbao.js') : path.join(dirname, '../../out/preload/suanbao.js')
}
