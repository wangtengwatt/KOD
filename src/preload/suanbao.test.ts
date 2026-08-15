import { SUANBAO_IPC_CHANNELS } from '@shared/suanbao-ipc'
import type { SuanbaoPetWindowApi } from '@shared/types/suanbao'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: { invoke: mocks.invoke, on: mocks.on, off: mocks.off },
}))

await import('./suanbao')

function getApi(): SuanbaoPetWindowApi {
  const call = mocks.exposeInMainWorld.mock.calls.find(([name]) => name === 'suanbaoAPI')
  if (!call) throw new Error('Suanbao preload API was not exposed')
  return call[1] as SuanbaoPetWindowApi
}

describe('Suanbao pet preload', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.on.mockReset()
    mocks.off.mockReset()
  })

  it('exposes only the approved capability-specific API', () => {
    expect(Object.keys(getApi()).sort()).toEqual(
      [
        'cancelOperation',
        'confirmOperation',
        'dispatchCommand',
        'getBootstrap',
        'hide',
        'minimize',
        'onNotificationClicked',
        'onViewModelChanged',
        'openMainWindow',
        'setInteractiveRegion',
        'updatePlacement',
      ].sort()
    )
  })

  it.each([
    ['hide', SUANBAO_IPC_CHANNELS.hide],
    ['minimize', SUANBAO_IPC_CHANNELS.minimize],
    ['openMainWindow', SUANBAO_IPC_CHANNELS.openMainWindow],
  ] as const)('maps %s to its named IPC channel', async (method, channel) => {
    mocks.invoke.mockResolvedValue(undefined)

    await getApi()[method]()

    expect(mocks.invoke).toHaveBeenCalledOnce()
    expect(mocks.invoke).toHaveBeenCalledWith(channel)
  })
})
