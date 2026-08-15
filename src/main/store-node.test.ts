import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs-extra'

// 第 5 周验证（arch §8）：store-node 启动时若 config.json 损坏，从最新合法备份回滚。
// 验证该机制能恢复包含 suanbao 偏好的备份（suanbao prefs 在 Settings/config.json 内，受通用备份保护）。
// store-node 顶层逻辑在 import 时执行（含回滚 + new Store + autoBackup），故用 vi.resetModules + 动态 import 触发。

const state = vi.hoisted(() => ({ tempDir: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.tempDir },
  powerMonitor: { on: () => undefined },
}))

vi.mock('./util', () => ({
  getLogger: () => ({ info: () => undefined, error: () => undefined, warn: () => undefined }),
}))

// 真 electron-store 在 vitest 下不一定走 mock 的 app.getPath，故用假 Store 直读 temp/config.json。
vi.mock('electron-store', () => ({
  default: class {
    path: string
    private data: Record<string, unknown> = {}
    constructor() {
      const p = require('path')
      const f = require('fs-extra')
      this.path = p.resolve(state.tempDir, 'config.json')
      try {
        this.data = JSON.parse(f.readFileSync(this.path, 'utf8'))
      } catch {
        this.data = {}
      }
    }
    get(key: string, defaultValue: unknown) {
      return key in this.data ? this.data[key] : defaultValue
    }
    set(key: string, value: unknown) {
      this.data[key] = value
    }
  },
}))

describe('store-node rollback protects suanbao preferences', () => {
  let tempDir: string

  beforeEach(async () => {
    vi.useFakeTimers()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'suanbao-rollback-'))
    state.tempDir = tempDir
  })

  afterEach(async () => {
    vi.useRealTimers()
    await fs.remove(tempDir)
  })

  const writeConfig = (content: string) => {
    fs.writeFileSync(path.resolve(tempDir, 'config.json'), content)
  }

  it('restores suanbao prefs from backup when config.json is corrupted', async () => {
    const suanbaoPrefs = {
      schemaVersion: 2,
      enabled: true,
      hidden: false,
      activeMode: false,
      soundEnabled: false,
      animation: 'full',
      locked: false,
      desktopOverlayEnabled: false,
      notificationsEnabled: false,
      locationMode: 'manual',
      calendarEnabled: false,
    }

    // 1. 合法 config.json（含 suanbao 偏好）
    writeConfig(
      JSON.stringify({
        settings: { suanbao: suanbaoPrefs },
        configVersion: 16,
        configs: {},
        lastShownAboutDialogVersion: '',
      })
    )

    // 2. 首次 import + 建一份备份（含 suanbao）
    vi.resetModules()
    let mod = await import('./store-node')
    await mod.backup()

    // 3. 损坏 config.json
    writeConfig('{ broken json')

    // 4. 重新 import → 顶层回滚：从备份恢复 config.json
    vi.resetModules()
    mod = await import('./store-node')
    const settings = mod.getSettings()

    // 回滚后 suanbao 偏好从备份恢复（非默认值 enabled=false，证明取自备份）
    expect(settings.suanbao).toMatchObject({
      enabled: true,
      animation: 'full',
      locationMode: 'manual',
    })
  })
})
