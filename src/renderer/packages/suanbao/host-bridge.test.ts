import type { ElectronIPC } from '@shared/electron-types'
import type { SuanbaoHostRequest } from '@shared/types/suanbao'
import { describe, expect, it, vi } from 'vitest'
import { createSuanbaoHostBridge } from './host-bridge'

describe('createSuanbaoHostBridge', () => {
  it('returns null when the preload did not expose the desktop bridge', () => {
    expect(createSuanbaoHostBridge(undefined)).toBeNull()
    expect(createSuanbaoHostBridge({} as ElectronIPC)).toBeNull()
  })

  it('drops malformed cross-window messages before they reach the service', () => {
    let emit: ((value: SuanbaoHostRequest) => void) | undefined
    const ipc = {
      suanbao: {
        publishBootstrap: vi.fn(),
        publishViewModel: vi.fn(),
        onCommand: (listener: (value: SuanbaoHostRequest) => void) => {
          emit = listener
          return () => undefined
        },
      },
    } as unknown as ElectronIPC
    const bridge = createSuanbaoHostBridge(ipc)
    const listener = vi.fn()
    bridge?.subscribe(listener)

    emit?.({ kind: 'dispatch-command', requestId: 'invalid', command: { type: 'open-bubble' } })
    expect(listener).not.toHaveBeenCalled()
  })
})
