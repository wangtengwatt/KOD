import { beforeEach, describe, expect, it, vi } from 'vitest'

const releaseKodRelayKey = vi.fn()
const selectKodRelayKey = vi.fn()
const fetchKodRelayModels = vi.fn()
const getKodRelayBalance = vi.fn()

vi.mock('@/packages/kodRelay', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/kodRelay')>()
  return {
    ...original,
    releaseKodRelayKey,
    selectKodRelayKey,
    fetchKodRelayModels,
    getKodRelayBalance,
  }
})

vi.mock('@/packages/remote', () => ({ getKodApiOrigin: () => 'https://kod.example' }))
vi.mock('@/stores/authInfoStore', () => {
  const state = { accessToken: 'token' }
  return {
    authInfoStore: { getState: () => state },
    useAuthInfoStore: () => state.accessToken,
  }
})
vi.mock('@/stores/settingsStore', () => ({
  settingsStore: {
    getState: () => ({ providers: {}, customProviders: [] }),
    setState: vi.fn(),
  },
}))

const first = { stationId: 1, stationUrl: 'https://first/v1', apiKeyId: 11, apiKey: 'sk-first' }
const second = { stationId: 2, stationUrl: 'https://second/v1', apiKeyId: 22, apiKey: 'sk-second' }

describe('shared Kod relay store', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
    const module = await import('./useKodRelay')
    module.clearKodRelayLocalState()
  })

  it('releases the previous key before selecting a new one', async () => {
    fetchKodRelayModels.mockResolvedValue([{ modelId: 'relay-model' }])
    const module = await import('./useKodRelay')

    await module.selectKodRelay(first)
    await module.selectKodRelay(second)

    expect(releaseKodRelayKey).toHaveBeenCalledTimes(1)
    expect(releaseKodRelayKey.mock.invocationCallOrder[0]).toBeLessThan(selectKodRelayKey.mock.invocationCallOrder[1])
    expect(module.kodRelayStore.getState().selection).toEqual({ ...second, modelId: 'relay-model' })
  })

  it('restores the previous key when a switch fails', async () => {
    fetchKodRelayModels.mockResolvedValueOnce([{ modelId: 'first-model' }]).mockRejectedValueOnce(new Error('down'))
    const module = await import('./useKodRelay')

    await module.selectKodRelay(first)
    await module.selectKodRelay(second)

    expect(module.kodRelayStore.getState().selection).toEqual({ ...first, modelId: 'first-model' })
    expect(selectKodRelayKey).toHaveBeenLastCalledWith(
      'https://kod.example',
      'token',
      expect.objectContaining({ stationId: first.stationId, apiKeyId: first.apiKeyId })
    )
  })

  it('globally falls back and recommends compatible models when the active model lacks a capability', async () => {
    fetchKodRelayModels
      .mockResolvedValueOnce([{ modelId: 'vision-first', capabilities: ['vision'] }])
      .mockResolvedValueOnce([{ modelId: 'plain-second' }, { modelId: 'vision-second', capabilities: ['vision'] }])
    const module = await import('./useKodRelay')

    await module.selectKodRelay(first)
    await module.selectKodRelay(second)
    await module.ensureKodRelayRequirement({ capability: 'vision', label: '图片理解' })

    expect(module.kodRelayStore.getState()).toMatchObject({
      selection: { ...first, modelId: 'vision-first' },
      recommendation: {
        target: { selection: { ...second, modelId: 'plain-second' } },
        models: [{ modelId: 'vision-second', capabilities: ['vision'] }],
      },
    })
  })

  it('compensates with release when models fail after selection', async () => {
    fetchKodRelayModels.mockRejectedValue(new Error('models failed'))
    const module = await import('./useKodRelay')

    await module.selectKodRelay(first)

    expect(selectKodRelayKey).toHaveBeenCalledOnce()
    expect(releaseKodRelayKey).toHaveBeenCalledOnce()
    expect(module.kodRelayStore.getState().selection).toBeNull()
    expect(module.kodRelayStore.getState().notice).toBe('unavailable')
  })

  it('restores models from localStorage once and shares the result', async () => {
    localStorage.setItem('kod_relay', JSON.stringify(first))
    fetchKodRelayModels.mockResolvedValue([{ modelId: 'restored-model' }])
    const module = await import('./useKodRelay')

    await Promise.all([module.ensureKodRelayRestored('token'), module.ensureKodRelayRestored('token')])

    expect(getKodRelayBalance).not.toHaveBeenCalled()
    expect(fetchKodRelayModels).toHaveBeenCalledOnce()
    expect(module.kodRelayStore.getState()).toMatchObject({
      selection: first,
      models: [{ modelId: 'restored-model' }],
    })
  })
})
