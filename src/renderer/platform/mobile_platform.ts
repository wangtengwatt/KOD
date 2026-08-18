import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Device } from '@capacitor/device'
import * as defaults from '@shared/defaults'
import type { Config, Settings, ShortcutSetting } from '@shared/types'
import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'
import { parseLocale } from '@/i18n/parser'
import type { ImageGenerationStorage } from '@/storage/ImageGenerationStorage'
import type { SessionMetaStorage } from '@/storage/SessionMetaStorage'
import { SQLiteImageGenerationStorage } from '@/storage/SQLiteImageGenerationStorage'
import { SQLiteSessionMetaStorage } from '@/storage/SQLiteSessionMetaStorage'
import { IndexedDBTaskSessionStorage, type TaskSessionStorage } from '@/storage/TaskSessionStorage'
import { CHATBOX_BUILD_PLATFORM } from '@/variables'
import { getBrowser, getOS } from '../packages/navigator'
import type { Platform, PlatformType } from './interfaces'
import type { KnowledgeBaseController } from './knowledge-base/interface'
import MobileExporter from './mobile_exporter'
import mobileLogger from './mobile_logger'
import type { SessionAttachmentRagController } from './session-attachment-rag/interface'
import { MobileSQLiteStorage } from './storages'
import type { SuanbaoPlatformController } from './suanbao/interface'
import { UnsupportedSuanbaoPlatformController } from './suanbao/unsupported-controller'
import { parseTextFileLocally } from './web_platform_utils'

export default class MobilePlatform extends MobileSQLiteStorage implements Platform {
  public type: PlatformType = 'mobile'

  public exporter = new MobileExporter()

  private navigationCallback: ((path: string) => void) | null = null
  private _imageGenerationStorage: ImageGenerationStorage | null = null
  private _taskSessionStorage: TaskSessionStorage | null = null
  private _sessionMetaStorage: SessionMetaStorage | null = null
  private _currentAccountKey: string | null = null
  private _currentImageGenAccountKey: string | null = null

  constructor() {
    super()
    mobileLogger.init().catch((e) => console.error('Failed to init mobile logger:', e))
    // Listen for both the custom KOD scheme and verified HTTPS app links.
    App.addListener('appUrlOpen', (event) => {
      console.debug('App URL opened:', event.url)
      this.handleDeepLink(event.url)
    })
  }

  private handleDeepLink(url: string): void {
    try {
      const normalizedUrl = url.replace(/^kod-dev:\/\//, 'kod://')
      const parsedUrl = new URL(normalizedUrl)
      const isKodScheme = parsedUrl.protocol === 'kod:'
      const isKodWebLink = parsedUrl.protocol === 'https:' && parsedUrl.hostname === 'kod.kai.com'

      if (!isKodScheme && !isKodWebLink) {
        console.warn('Rejected non-KOD deep link:', url)
        return
      }

      const host = isKodScheme ? parsedUrl.hostname : parsedUrl.pathname.split('/').filter(Boolean)[0]
      const pathname = isKodScheme
        ? parsedUrl.pathname
        : `/${parsedUrl.pathname.split('/').filter(Boolean).slice(1).join('/')}`

      if (host === 'provider' && pathname === '/import') {
        const encodedConfig = parsedUrl.searchParams.get('config') || ''
        const path = `/settings/provider?import=${encodeURIComponent(encodedConfig)}`
        this.triggerNavigation(path)
        return
      }

      if (host === 'mcp' && pathname === '/install') {
        const server = parsedUrl.searchParams.get('server') || ''
        this.triggerNavigation(`/settings/mcp?install=${encodeURIComponent(server)}`)
        return
      }

      if (host === 'compute' && pathname === '/invite') {
        const code = parsedUrl.searchParams.get('code')?.trim().toLowerCase() || ''
        if (/^[0-9a-f]{32}$/.test(code)) this.triggerNavigation(`/compute-center?invite=${encodeURIComponent(code)}`)
        return
      }

      if (host === 'auth' && pathname === '/callback') {
        // The login hook completes authentication after the application becomes active.
        return
      }

      console.warn('Unhandled deep link:', url)
    } catch (error) {
      console.error('Failed to handle deep link:', error)
    }
  }

  // 触发导航
  private triggerNavigation(path: string): void {
    if (this.navigationCallback) {
      this.navigationCallback(path)
    } else {
      console.warn('Navigation callback not set, path:', path)
    }
  }

  // 设置导航回调（类似 electronAPI.onNavigate）
  public onNavigate(callback: (path: string) => void): () => void {
    this.navigationCallback = callback
    return () => {
      this.navigationCallback = null
    }
  }

  public async getVersion(): Promise<string> {
    return (await App.getInfo()).version
  }
  public async getPlatform(): Promise<string> {
    return CHATBOX_BUILD_PLATFORM
  }
  public async getArch(): Promise<string> {
    return 'arm64'
  }
  public async shouldUseDarkColors(): Promise<boolean> {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  public onSystemThemeChange(callback: () => void): () => void {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', callback)
    return () => {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', callback)
    }
  }
  public onWindowShow(callback: () => void): () => void {
    return this.onWindowFocused(callback)
  }
  public onWindowFocused(callback: () => void): () => void {
    let active = true
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (active && isActive) callback()
    })
    return () => {
      active = false
      void handle.then((listener) => listener.remove())
    }
  }
  public onUpdateDownloaded(callback: () => void): () => void {
    return () => null
  }
  public async openPaymentUrl(url: string): Promise<void> {
    // 与桌面端一致：先校验支付链接（HTTPS / 白名单域名），再在应用内浏览器标签打开
    const { assertPaymentUrl, parsePaymentHosts } = await import('@shared/payment-url')
    const { KOD_API_ORIGIN } = await import('@/packages/remote')
    const { KOD_PAYMENT_HOSTS } = await import('@/variables')
    const parsed = assertPaymentUrl(url, parsePaymentHosts(KOD_PAYMENT_HOSTS, KOD_API_ORIGIN))
    await this.openLink(parsed.toString())
  }
  public async openLink(url: string): Promise<void> {
    try {
      // 使用 Browser.open 打开
      // 原生插件不受 JavaScript 用户手势限制，可以在异步调用后正常工作
      // iOS: 会使用 SFSafariViewController 而不是普通 webview
      // Android: 使用 Chrome Custom Tabs
      await Browser.open({
        url,
      })
    } catch (error) {
      console.error('Failed to open link with Browser plugin:', error)
      // 降级方案：使用 window.open（但在异步调用后可能被阻止）
      window.open(url)
    }
  }
  public async getDeviceName(): Promise<string> {
    try {
      const info = await Device.getInfo()

      // iOS: 直接返回 model 型号（如 "iPhone13,4"），官网会 mapping 成 "iPhone 13 Pro Max"
      if (info.platform === 'ios') {
        return info.model
      }

      // Android: 使用降级策略
      // 优先使用 name（用户自定义的设备名称）
      if (info.name) {
        return info.name
      }
      // 如果没有 name，返回 manufacturer + model
      if (info.manufacturer && info.model) {
        return `${info.manufacturer} ${info.model}`
      }
      // 降级到 model 或 platform
      return info.model || info.platform || getOS()
    } catch (error) {
      console.error('Failed to get device info:', error)
      // 降级方案：返回 OS 信息
      return getOS()
    }
  }
  public async getInstanceName(): Promise<string> {
    return `${getOS()} / ${getBrowser()}`
  }
  public async getLocale() {
    const lang = window.navigator.language
    return parseLocale(lang)
  }
  public async ensureShortcutConfig(config: ShortcutSetting): Promise<void> {
    return
  }
  public async ensureProxyConfig(config: { proxy?: string }): Promise<void> {
    return
  }
  public async relaunch(): Promise<void> {
    location.reload()
  }

  public async getConfig(): Promise<Config> {
    let value = await this.getStoreValue('configs')
    if (value === undefined || value === null) {
      value = defaults.newConfigs()
      this.setStoreValue('configs', value)
    }
    return value
  }
  public async getSettings(): Promise<Settings> {
    let value = await this.getStoreValue('settings')
    if (value === undefined || value === null) {
      value = defaults.settings()
      this.setStoreValue('settings', value)
    }
    return value
  }

  public async getStoreBlob(key: string): Promise<string | null> {
    return localforage.getItem<string>(key)
  }
  public async setStoreBlob(key: string, value: string): Promise<void> {
    await localforage.setItem(key, value)
  }
  public async delStoreBlob(key: string) {
    return localforage.removeItem(key)
  }
  public async listStoreBlobKeys(): Promise<string[]> {
    return localforage.keys()
  }

  public async initTracking() {
    const GAID = 'G-B365F44W6E'
    try {
      const conf = await this.getConfig()
      window.gtag('config', GAID, {
        app_name: 'chatbox',
        user_id: conf.uuid,
        client_id: conf.uuid,
        app_version: await this.getVersion(),
        chatbox_platform_type: 'web',
        chatbox_platform: await this.getPlatform(),
        app_platform: await this.getPlatform(),
      })
    } catch (e) {
      window.gtag('config', GAID, {
        app_name: 'chatbox',
      })
      throw e
    }
  }
  public trackingEvent(name: string, params: { [key: string]: string }) {
    window.gtag('event', name, params)
  }

  public async shouldShowAboutDialogWhenStartUp(): Promise<boolean> {
    return false
  }

  public async appLog(level: string, message: string): Promise<void> {
    mobileLogger.log(level, message)
  }

  public async exportLogs(): Promise<string> {
    return mobileLogger.exportLogs()
  }

  public async clearLogs(): Promise<void> {
    return mobileLogger.clearLogs()
  }

  public async ensureAutoLaunch(enable: boolean) {
    return
  }

  async parseFileLocally(file: File): Promise<{ key?: string; isSupported: boolean }> {
    const result = await parseTextFileLocally(file)
    if (!result.isSupported) {
      return { isSupported: false }
    }
    const key = `parseFile-${uuidv4()}`
    await this.setStoreBlob(key, result.text)
    return { key, isSupported: true }
  }

  getLocalFilePath(file: File): string {
    return file.path || ''
  }

  public async parseUrl(url: string): Promise<{ key: string; title: string }> {
    throw new Error('Not implemented')
  }

  public async isFullscreen() {
    return true
  }

  public async setFullscreen(enabled: boolean): Promise<void> {
    return
  }

  installUpdate(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public getKnowledgeBaseController(): KnowledgeBaseController {
    throw new Error('Method not implemented.')
  }

  public getSessionAttachmentRagController(): SessionAttachmentRagController {
    throw new Error('Session attachment RAG is not implemented on mobile.')
  }

  public getSuanbaoController(): SuanbaoPlatformController {
    return new UnsupportedSuanbaoPlatformController('Desktop overlay is unavailable in the mobile client')
  }

  public getImageGenerationStorage(accountKey?: string): ImageGenerationStorage {
    const key = accountKey ?? null
    if (key !== this._currentImageGenAccountKey || !this._imageGenerationStorage) {
      this._currentImageGenAccountKey = key
      this._imageGenerationStorage = new SQLiteImageGenerationStorage(accountKey)
    }
    return this._imageGenerationStorage
  }

  public getTaskSessionStorage(accountKey?: string): TaskSessionStorage {
    const key = accountKey ?? null
    if (key !== this._currentAccountKey || !this._taskSessionStorage) {
      this._currentAccountKey = key
      this._taskSessionStorage = new IndexedDBTaskSessionStorage(accountKey)
    }
    return this._taskSessionStorage
  }

  public getSessionMetaStorage(accountKey?: string): SessionMetaStorage {
    const key = accountKey ?? null
    if (key !== this._currentAccountKey || !this._sessionMetaStorage) {
      this._currentAccountKey = key
      this._sessionMetaStorage = new SQLiteSessionMetaStorage(accountKey)
    }
    return this._sessionMetaStorage
  }

  public minimize() {
    return Promise.resolve()
  }

  public maximize() {
    return Promise.resolve()
  }

  public unmaximize() {
    return Promise.resolve()
  }

  public closeWindow() {
    return Promise.resolve()
  }

  public isMaximized() {
    return Promise.resolve(true)
  }

  public onMaximizedChange() {
    return () => null
  }
}
