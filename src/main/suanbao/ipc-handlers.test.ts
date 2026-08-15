import { SUANBAO_IPC_CHANNELS } from '@shared/suanbao-ipc'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerSuanbaoIpcHandlers } from './ipc-handlers'

interface SenderEvent {
  sender: { id: number }
}

type Handler = (event: SenderEvent, value?: unknown) => unknown

const PET_WINDOW_ID = 10
const MAIN_WINDOW_ID = 20

function createHarness() {
  const handlers = new Map<string, Handler>()
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
  }
  const windowManager = {
    isPetWindowSender: vi.fn((id: number) => id === PET_WINDOW_ID),
    isMainWindowSender: vi.fn((id: number) => id === MAIN_WINDOW_ID),
    hide: vi.fn(),
    minimize: vi.fn(),
  }

  const registration = registerSuanbaoIpcHandlers(ipcMain as never, windowManager as never, {} as never)
  const invoke = (channel: string, senderId: number, value?: unknown) => {
    const handler = handlers.get(channel)
    if (!handler) throw new Error(`Missing handler: ${channel}`)
    return handler({ sender: { id: senderId } }, value)
  }

  return { handlers, ipcMain, invoke, registration, windowManager }
}

describe('registerSuanbaoIpcHandlers window controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([PET_WINDOW_ID, MAIN_WINDOW_ID])('allows known sender %s to hide the pet', (senderId) => {
    const { invoke, windowManager } = createHarness()

    invoke(SUANBAO_IPC_CHANNELS.hide, senderId)

    expect(windowManager.hide).toHaveBeenCalledOnce()
  })

  it('rejects an unknown sender attempting to hide the pet', () => {
    const { invoke, windowManager } = createHarness()

    expect(() => invoke(SUANBAO_IPC_CHANNELS.hide, 99)).toThrow('SUANBAO_UNAUTHORIZED_SENDER')
    expect(windowManager.hide).not.toHaveBeenCalled()
  })

  it('allows only the pet sender to minimize the pet window', () => {
    const { invoke, windowManager } = createHarness()

    invoke(SUANBAO_IPC_CHANNELS.minimize, PET_WINDOW_ID)

    expect(windowManager.minimize).toHaveBeenCalledOnce()
    expect(() => invoke(SUANBAO_IPC_CHANNELS.minimize, MAIN_WINDOW_ID)).toThrow('SUANBAO_UNAUTHORIZED_SENDER')
    expect(() => invoke(SUANBAO_IPC_CHANNELS.minimize, 99)).toThrow('SUANBAO_UNAUTHORIZED_SENDER')
    expect(windowManager.minimize).toHaveBeenCalledOnce()
  })

  it('removes every registered handler during disposal', () => {
    const { handlers, ipcMain, registration } = createHarness()

    registration.dispose()

    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(handlers.size)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(SUANBAO_IPC_CHANNELS.hide)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(SUANBAO_IPC_CHANNELS.minimize)
  })
})
