import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ ofetch: vi.fn() }))

vi.mock('ofetch', () => ({ ofetch: mocks.ofetch }))
vi.mock('@/lib/utils', () => ({ getLogger: () => ({ debug: vi.fn(), error: vi.fn() }) }))
vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    getPlatform: vi.fn(),
    getVersion: vi.fn(),
    getConfig: vi.fn(),
    setStoreBlob: vi.fn(),
  },
}))
vi.mock('@/stores/authInfoStore', () => ({ authInfoStore: { getState: vi.fn() } }))
vi.mock('@/variables', () => ({
  CHATBOX_BUILD_CHANNEL: 'stable',
  USE_BETA_API: false,
  USE_BETA_CHATBOX: false,
  USE_LOCAL_API: false,
  USE_LOCAL_CHATBOX: false,
  USE_NEWDB_API: false,
}))

import { fetchKodRelayStationModels } from './remote'

describe('fetchKodRelayStationModels', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['https://relay.example.com/v1', 'https://relay.example.com/v1/models'],
    ['https://relay.example.com/v1/', 'https://relay.example.com/v1/models'],
    [' https://relay.example.com/v1/models/ ', 'https://relay.example.com/v1/models'],
  ])('normalizes relay URL %s', async (url, expectedUrl) => {
    mocks.ofetch.mockResolvedValue({ object: 'list', data: [] })

    await fetchKodRelayStationModels({ url, apiKey: 'secret' })

    expect(mocks.ofetch).toHaveBeenCalledWith(expectedUrl, {
      method: 'GET',
      headers: { Authorization: 'Bearer secret' },
    })
  })

  it('loads the actual kai-new-api /v1/models shape and ignores extended metadata', async () => {
    mocks.ofetch.mockResolvedValue({
      object: 'list',
      data: [
        {
          id: 'gpt-4.1',
          object: 'model',
          created: 1741564800,
          owned_by: 'openai',
        },
        {
          id: 'gemini-2.5-flash-image',
          object: 'model',
          created: 1741564800,
          owned_by: 'google',
          name: 'Gemini Flash Image',
          context_length: '1048576',
          architecture: {
            input_modalities: ['text', 'image'],
            output_modalities: ['text', 'image'],
            tokenizer: 'Gemini',
          },
          pricing: {
            prompt: '0.0000003',
            completion: '0.0000025',
            internal_reasoning: 0.000001,
            web_search: '0',
          },
          supported_parameters: ['tools', 'temperature'],
          supported_endpoint_types: ['openai', 'google'],
          extra_metadata: { channel: 1 },
        },
      ],
      has_more: false,
      first_id: 'gpt-4.1',
      last_id: 'gemini-2.5-flash-image',
    })

    await expect(
      fetchKodRelayStationModels({ url: 'https://relay.example.com/v1', apiKey: 'secret' })
    ).resolves.toEqual([
      {
        modelId: 'gpt-4.1',
        nickname: undefined,
        type: 'chat',
        contextWindow: undefined,
        capabilities: [],
      },
      {
        modelId: 'gemini-2.5-flash-image',
        nickname: 'Gemini Flash Image',
        type: 'image',
        contextWindow: 1048576,
        capabilities: ['vision', 'reasoning', 'tool_use'],
      },
    ])
  })

  it('maps nullable metadata and numeric pricing without rejecting the model list', async () => {
    mocks.ofetch.mockResolvedValue({
      data: [
        {
          id: 'claude-relay',
          name: null,
          context_length: null,
          architecture: null,
          supported_parameters: ['tool_choice'],
          pricing: { internal_reasoning: 0, web_search: 1, unrelated: true },
        },
      ],
    })

    await expect(
      fetchKodRelayStationModels({ url: 'https://relay.example.com/v1', apiKey: 'secret' })
    ).resolves.toEqual([
      {
        modelId: 'claude-relay',
        nickname: undefined,
        type: 'chat',
        contextWindow: undefined,
        capabilities: ['tool_use', 'web_search'],
      },
    ])
  })

  it('recognizes common image model identifiers case-insensitively', async () => {
    mocks.ofetch.mockResolvedValue({
      data: [
        { id: 'DALL-E-3' },
        { id: 'flux-1-schnell' },
        { id: 'stable-diffusion-xl' },
        { id: 'midjourney-v6' },
        { id: 'text-model' },
      ],
    })

    const models = await fetchKodRelayStationModels({ url: 'https://relay.example.com/v1', apiKey: 'secret' })

    expect(models.map(({ type }) => type)).toEqual(['image', 'image', 'image', 'image', 'chat'])
  })

  it('rejects malformed responses instead of silently dropping invalid entries', async () => {
    mocks.ofetch.mockResolvedValue({ object: 'list', data: [{ object: 'model', owned_by: 'openai' }] })

    await expect(
      fetchKodRelayStationModels({ url: 'https://relay.example.com/v1', apiKey: 'secret' })
    ).rejects.toThrow()
  })
})
