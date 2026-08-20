import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyKodRelayProvider,
  fetchKodRelayModels,
  isKodRelayModel,
  KOD_RELAY_PROVIDER_ID,
  KodRelayConflictError,
  readKodRelaySelection,
  selectKodRelayKey,
} from './kodRelay'

const selection = {
  stationId: 3,
  stationUrl: 'https://relay.example/v1/',
  apiKeyId: 7,
  apiKey: 'sk-relay',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Kod relay persistence and provider', () => {
  it('rejects malformed persisted selections', () => {
    expect(readKodRelaySelection({ getItem: () => '{"stationId":"3"}' })).toBeNull()
    expect(readKodRelaySelection({ getItem: () => JSON.stringify(selection) })).toEqual(selection)
  })

  it('adds and removes only the dynamic relay provider', () => {
    const settings = {
      providers: { openai: { apiKey: 'keep' } },
      customProviders: [
        {
          id: 'keep-provider',
          name: 'Keep',
          type: 'openai' as const,
          isCustom: true as const,
        },
      ],
    }
    const models = [{ modelId: 'gpt-relay', type: 'chat' as const }]

    const added = applyKodRelayProvider(settings as never, selection, models)
    expect(added.providers?.openai?.apiKey).toBe('keep')
    expect(added.providers?.[KOD_RELAY_PROVIDER_ID]).toMatchObject({
      apiHost: selection.stationUrl,
      apiKey: selection.apiKey,
      models,
    })
    expect(added.customProviders?.map((provider) => provider.id)).toEqual(['keep-provider', KOD_RELAY_PROVIDER_ID])

    const removed = applyKodRelayProvider({ ...settings, ...(added as object) } as never, null, [])
    expect(removed.providers?.openai?.apiKey).toBe('keep')
    expect(removed.providers?.[KOD_RELAY_PROVIDER_ID]).toBeUndefined()
    expect(removed.customProviders?.map((provider) => provider.id)).toEqual(['keep-provider'])
  })

  it('filters by provider id as well as model id', () => {
    const model = { modelId: 'same-id' }
    expect(isKodRelayModel(model, KOD_RELAY_PROVIDER_ID)).toBe(true)
    expect(isKodRelayModel(model, 'openai')).toBe(false)
  })
})

describe('Kod relay API', () => {
  it('normalizes the model endpoint and maps OpenAI models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'gpt-relay', name: 'Relay GPT' }, { id: 1 }] }), {
        status: 200,
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchKodRelayModels(selection)).resolves.toEqual([
      { modelId: 'gpt-relay', nickname: 'Relay GPT', type: 'chat' },
    ])
    expect(fetchMock).toHaveBeenCalledWith('https://relay.example/v1/models', {
      headers: { Authorization: 'Bearer sk-relay' },
      signal: undefined,
    })
  })

  it('classifies relay image models so the image creator can display them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'gemini-2.5-flash-image', name: 'Gemini Image' },
            { id: 'gpt-relay', name: 'Relay GPT' },
          ],
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchKodRelayModels(selection)).resolves.toEqual([
      expect.objectContaining({ modelId: 'gemini-2.5-flash-image', type: 'image' }),
      expect.objectContaining({ modelId: 'gpt-relay', type: 'chat' }),
    ])
  })

  it('surfaces HTTP or payload 409 as a conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 409, message: 'occupied' }), { status: 200 }))
    )

    await expect(selectKodRelayKey('https://kod.example/', 'token', selection)).rejects.toBeInstanceOf(
      KodRelayConflictError
    )
  })
})
