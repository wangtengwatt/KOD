import path from 'node:path'
import {
  isAllowedTinpayUrl,
  TINPAY_IPC_CHANNELS,
  TINPAY_ORIGIN,
  TINPAY_SESSION_PARTITION,
  type TinpayNotification,
  type TinpayOpenResult,
  type TinpaySessionId,
  tinpayCloseRequestSchema,
  tinpayOpenRequestSchema,
  tinpayPageEventSchema,
} from '@shared/tinpay'
import {
  BrowserWindow,
  type IpcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Session,
  screen,
  session,
  shell,
  type WebContents,
} from 'electron'
import log from 'electron-log/main'

const WINDOW_SIZE = { width: 420, height: 720 }
const MINIMUM_WINDOW_SIZE = { width: 360, height: 640 }

type ActiveTinpaySession = {
  sessionId: TinpaySessionId
  checkoutUrl: string
  expiresAt: number
  window: BrowserWindow | null
}

export interface TinpayDesktopModuleOptions {
  ipcMain: IpcMain
  isPackaged: boolean
  dirname: string
  getMainWindow(): BrowserWindow | null
}

export interface TinpayDesktopModule {
  handleDeepLinkResult(sessionId: TinpaySessionId): boolean
  dispose(): void
}

function resolveTinpayPreloadPath(isPackaged: boolean, dirname: string): string {
  return isPackaged ? path.join(dirname, '../preload/tinpay.js') : path.join(dirname, '../../out/preload/tinpay.js')
}

function isExactMainFrame(event: IpcMainInvokeEvent | IpcMainEvent, webContents: WebContents): boolean {
  return event.sender.id === webContents.id && event.senderFrame === webContents.mainFrame
}

function safeFrameUrl(senderFrame: Electron.WebFrameMain | null): string {
  try {
    return senderFrame?.url ?? ''
  } catch {
    return ''
  }
}

export function createTinpayDesktopModule(options: TinpayDesktopModuleOptions): TinpayDesktopModule {
  const tinpaySession: Session = session.fromPartition(TINPAY_SESSION_PARTITION, { cache: true })
  const preloadPath = resolveTinpayPreloadPath(options.isPackaged, options.dirname)
  const registeredInvokeChannels: string[] = []
  let active: ActiveTinpaySession | null = null
  let opening: Promise<TinpayOpenResult> | null = null
  let disposed = false

  const notifyMainRenderer = (notification: TinpayNotification) => {
    const mainWindow = options.getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(TINPAY_IPC_CHANNELS.notification, notification)
  }

  const isMainRendererEvent = (event: IpcMainInvokeEvent): boolean => {
    const mainWindow = options.getMainWindow()
    return !!mainWindow && !mainWindow.isDestroyed() && isExactMainFrame(event, mainWindow.webContents)
  }

  const isActiveTinpayFrame = (
    webContents: WebContents | null,
    requestingUrl: string,
    isMainFrame?: boolean
  ): boolean => {
    if (!active || !active.window || !webContents || active.window.isDestroyed() || isMainFrame === false) return false
    return (
      webContents.id === active.window.webContents.id &&
      webContents.session === tinpaySession &&
      isAllowedTinpayUrl(requestingUrl)
    )
  }

  tinpaySession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission !== 'media') return false
    const frameUrl = details?.requestingUrl || requestingOrigin
    return isActiveTinpayFrame(webContents, frameUrl, details?.isMainFrame) && requestingOrigin === TINPAY_ORIGIN
  })

  tinpaySession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const frameUrl = details.requestingUrl || webContents.getURL()
    const allowed = permission === 'media' && isActiveTinpayFrame(webContents, frameUrl, details.isMainFrame)
    callback(allowed)
    if (!allowed && permission === 'media' && active?.window && webContents.id === active.window.webContents.id) {
      notifyMainRenderer({ type: 'permission-denied', sessionId: active.sessionId, permission: 'media' })
    }
  })

  const destroyActiveWindow = (notifyClosed: boolean) => {
    const current = active
    if (!current) return
    const window = current.window
    current.window = null
    if (window && !window.isDestroyed()) window.destroy()
    if (notifyClosed) notifyMainRenderer({ type: 'window-closed', sessionId: current.sessionId })
  }

  const showActiveWindow = (current: ActiveTinpaySession) => {
    const window = current.window
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  const createWindow = async (input: ReturnType<typeof tinpayOpenRequestSchema.parse>): Promise<TinpayOpenResult> => {
    const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workAreaSize
    const width = Math.min(WINDOW_SIZE.width, Math.max(1, workArea.width))
    const height = Math.min(WINDOW_SIZE.height, Math.max(1, workArea.height))
    const window = new BrowserWindow({
      title: 'Tinpay',
      width,
      height,
      minWidth: Math.min(MINIMUM_WINDOW_SIZE.width, width),
      minHeight: Math.min(MINIMUM_WINDOW_SIZE.height, height),
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        devTools: !options.isPackaged,
        partition: TINPAY_SESSION_PARTITION,
        preload: preloadPath,
      },
    })

    const current: ActiveTinpaySession = {
      sessionId: input.sessionId,
      checkoutUrl: input.checkoutUrl,
      expiresAt: Date.parse(input.expiresAt),
      window,
    }
    active = current
    window.setMenuBarVisibility(false)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-attach-webview', (event) => event.preventDefault())
    window.webContents.on('will-navigate', (event, url) => {
      if (!isAllowedTinpayUrl(url)) event.preventDefault()
    })
    window.webContents.on('will-redirect', (event, url) => {
      if (!isAllowedTinpayUrl(url)) event.preventDefault()
    })
    window.webContents.on('devtools-opened', () => {
      if (options.isPackaged) window.webContents.closeDevTools()
    })
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      log.error('[Tinpay] Checkout failed to load.', { errorCode, errorDescription })
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      log.error('[Tinpay] Checkout renderer exited.', details)
    })
    window.on('closed', () => {
      if (active?.window !== window) return
      active.window = null
      notifyMainRenderer({ type: 'window-closed', sessionId: active.sessionId })
    })
    window.once('ready-to-show', () => showActiveWindow(current))

    try {
      await window.loadURL(input.checkoutUrl)
    } catch (error) {
      if (active?.window === window) active = null
      if (!window.isDestroyed()) window.destroy()
      throw error
    }

    if (active?.window !== window || window.isDestroyed()) throw new Error('TINPAY_WINDOW_CLOSED')
    showActiveWindow(current)
    return { sessionId: input.sessionId, disposition: 'opened' }
  }

  const open = async (event: IpcMainInvokeEvent, value: unknown): Promise<TinpayOpenResult> => {
    if (!isMainRendererEvent(event)) throw new Error('TINPAY_UNAUTHORIZED_SENDER')
    const input = tinpayOpenRequestSchema.parse(value)
    if (Date.parse(input.expiresAt) <= Date.now()) throw new Error('TINPAY_SESSION_EXPIRED')

    if (active && active.sessionId !== input.sessionId) {
      throw new Error('TINPAY_SESSION_ALREADY_ACTIVE')
    }
    if (active && active.checkoutUrl !== input.checkoutUrl) {
      throw new Error('TINPAY_SESSION_ALREADY_ACTIVE')
    }
    if (active?.window && !active.window.isDestroyed()) {
      showActiveWindow(active)
      return { sessionId: input.sessionId, disposition: 'focused' }
    }
    if (opening) return opening

    opening = createWindow(input)
    try {
      return await opening
    } finally {
      opening = null
    }
  }

  const close = (event: IpcMainInvokeEvent, value: unknown) => {
    if (!isMainRendererEvent(event)) throw new Error('TINPAY_UNAUTHORIZED_SENDER')
    const input = tinpayCloseRequestSchema.parse(value)
    if (!active || active.sessionId !== input.sessionId) return
    destroyActiveWindow(false)
  }

  const openExternal = async (event: IpcMainInvokeEvent, value: unknown) => {
    if (!isMainRendererEvent(event)) throw new Error('TINPAY_UNAUTHORIZED_SENDER')
    const input = tinpayCloseRequestSchema.parse(value)
    if (!active || active.sessionId !== input.sessionId) throw new Error('TINPAY_SESSION_NOT_ACTIVE')
    if (active.expiresAt <= Date.now()) throw new Error('TINPAY_SESSION_EXPIRED')
    if (!isAllowedTinpayUrl(active.checkoutUrl)) throw new Error('TINPAY_INVALID_STORED_URL')
    await shell.openExternal(active.checkoutUrl)
  }

  const registerInvoke = (channel: string, listener: (event: IpcMainInvokeEvent, value: unknown) => unknown) => {
    options.ipcMain.removeHandler(channel)
    options.ipcMain.handle(channel, listener)
    registeredInvokeChannels.push(channel)
  }

  registerInvoke(TINPAY_IPC_CHANNELS.open, open)
  registerInvoke(TINPAY_IPC_CHANNELS.close, close)
  registerInvoke(TINPAY_IPC_CHANNELS.openExternal, openExternal)

  const pageEventListener = (event: IpcMainEvent, value: unknown) => {
    const current = active
    if (!current || !current.window || current.window.isDestroyed()) return
    if (!isExactMainFrame(event, current.window.webContents)) return
    if (event.sender.session !== tinpaySession || !isAllowedTinpayUrl(safeFrameUrl(event.senderFrame))) return
    const parsed = tinpayPageEventSchema.safeParse(value)
    if (!parsed.success || parsed.data.sessionId !== current.sessionId || current.expiresAt <= Date.now()) return
    notifyMainRenderer({ type: 'event', sessionId: current.sessionId, event: parsed.data })
  }
  options.ipcMain.on(TINPAY_IPC_CHANNELS.event, pageEventListener)

  return {
    handleDeepLinkResult(sessionId) {
      if (disposed || !active || active.sessionId !== sessionId || active.expiresAt <= Date.now()) return false
      notifyMainRenderer({ type: 'deep-link-result', sessionId })
      return true
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const channel of registeredInvokeChannels) options.ipcMain.removeHandler(channel)
      options.ipcMain.off(TINPAY_IPC_CHANNELS.event, pageEventListener)
      tinpaySession.setPermissionCheckHandler(null)
      tinpaySession.setPermissionRequestHandler(null)
      destroyActiveWindow(false)
    },
  }
}
