import type { ElectronIPC } from '@shared/electron-types'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
  },
}))

vi.mock('@capacitor-community/sqlite', () => {
  class SQLiteConnection {
    async closeConnection() {}

    async createConnection() {
      return {
        async open() {},
        async execute() {},
      }
    }
  }

  return {
    CapacitorSQLite: {},
    SQLiteConnection,
  }
})
import DesktopPlatform from './desktop_platform'
import MobilePlatform from './mobile_platform'
import TestPlatform from './test_platform'
import WebPlatform from './web_platform'

describe('platform capabilities', () => {
  it('exposes a complete, runtime-specific capability descriptor for every platform', async () => {
    const platforms = [
      [
        new DesktopPlatform({} as ElectronIPC),
        {
          runtime: 'desktop',
          localFiles: true,
          mobilePermissions: false,
          localSandbox: true,
          cloudSandbox: false,
          sqlite: false,
          externalBrowser: true,
        },
      ],
      [
        new MobilePlatform(),
        {
          runtime: 'android',
          localFiles: true,
          mobilePermissions: true,
          localSandbox: false,
          cloudSandbox: true,
          sqlite: true,
          externalBrowser: true,
        },
      ],
      [
        new WebPlatform(),
        {
          runtime: 'web',
          localFiles: false,
          mobilePermissions: false,
          localSandbox: false,
          cloudSandbox: false,
          sqlite: false,
          externalBrowser: false,
        },
      ],
      [
        new TestPlatform(),
        {
          runtime: 'test',
          localFiles: false,
          mobilePermissions: false,
          localSandbox: false,
          cloudSandbox: false,
          sqlite: false,
          externalBrowser: false,
        },
      ],
    ] as const

    for (const [platform, expectedCapabilities] of platforms) {
      await expect(platform.getCapabilities()).resolves.toEqual(expectedCapabilities)
    }
  })
})
