import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { CallChatCompletionOptions } from '@shared/models/types'
import { ProviderModelInfoSchema, type ChatboxAILicenseDetail, type ProviderModelInfo } from '@shared/types'
import type { ModelDependencies } from '@shared/types/adapters'
import type { SentryScope } from '@shared/utils/sentry_adapter'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatboxAI from './chatboxai'

const openAICompatibleMocks = vi.hoisted(() => {
  const languageModel: LanguageModelV3 = {
    specificationVersion: 'v3',
    provider: 'KodAI',
    modelId: 'gpt-5-mini',
    supportedUrls: {},
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  }

  const languageModelFactory = vi.fn(() => languageModel)
  const createOpenAICompatible = vi.fn(() => ({
    languageModel: languageModelFactory,
  }))

  return {
    createOpenAICompatible,
    languageModelFactory,
  }
})

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: openAICompatibleMocks.createOpenAICompatible,
}))

class TestChatboxAI extends ChatboxAI {
  public exposeProvider(options: CallChatCompletionOptions) {
    return this.getProvider(options)
  }

  public exposeChatModel(options: CallChatCompletionOptions) {
    return this.getChatModel(options)
  }
}

function createDependencies(): ModelDependencies {
  return {
    request: {
      apiRequest: vi.fn(),
      fetchWithOptions: vi.fn(),
    },
    storage: {
      saveImage: vi.fn(),
      getImage: vi.fn(),
    },
    sentry: {
      captureException: vi.fn(),
      withScope: vi.fn((callback: (scope: SentryScope) => void) =>
        callback({
          setTag: vi.fn(),
          setExtra: vi.fn(),
        })
      ),
    },
    getRemoteConfig: vi.fn(),
    platformType: 'desktop',
  }
}

function createModel(model: ProviderModelInfo, relay: { apiHost?: string; apiKey?: string } = {}) {
  return new TestChatboxAI(
    {
      licenseKey: 'test-license',
      licenseInstances: {
        'test-license': 'test-instance',
      },
      apiHost: relay.apiHost ?? 'https://relay.example/v1/',
      apiKey: relay.apiKey ?? 'relay-api-key',
      licenseDetail: {} as ChatboxAILicenseDetail,
      model,
      language: 'en',
      dalleStyle: 'vivid',
    },
    { uuid: 'test-uuid' },
    createDependencies()
  )
}

describe('ChatboxAI openai-responses models', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts openai-responses as a provider model apiStyle', () => {
    const parsed = ProviderModelInfoSchema.parse({
      modelId: 'gpt-5-mini',
      type: 'chat',
      apiStyle: 'openai-responses',
      capabilities: ['reasoning', 'tool_use'],
    })

    expect(parsed.apiStyle).toBe('openai-responses')
  })

  it('creates a configured KOD relay provider for openai-responses models', () => {
    const model = createModel({
      modelId: 'gpt-5-mini',
      type: 'chat',
      apiStyle: 'openai-responses',
      capabilities: ['reasoning', 'tool_use'],
    })

    model.exposeProvider({ sessionId: 'session-123' })

    expect(openAICompatibleMocks.createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'KodAI',
        apiKey: 'relay-api-key',
        baseURL: 'https://relay.example/v1',
        headers: {
          'chatbox-session-id': 'session-123',
        },
        fetch: expect.any(Function),
      })
    )
  })

  it('uses the configured relay language model for openai-responses chat models', () => {
    const model = createModel({
      modelId: 'gpt-5-mini',
      type: 'chat',
      apiStyle: 'openai-responses',
      capabilities: ['reasoning', 'tool_use'],
    })

    const chatModel = model.exposeChatModel({ sessionId: 'session-123' })

    expect(openAICompatibleMocks.languageModelFactory).toHaveBeenCalledWith('gpt-5-mini')
    expect(chatModel.modelId).toBe('gpt-5-mini')
  })

  it('fails explicitly when the KOD relay is not configured', () => {
    const model = createModel(
      {
        modelId: 'gpt-5-mini',
        type: 'chat',
        apiStyle: 'openai-responses',
        capabilities: ['reasoning', 'tool_use'],
      },
      { apiHost: '', apiKey: '' }
    )

    expect(() => model.exposeProvider({ sessionId: 'session-123' })).toThrow(
      'Kod AI relay station is not configured. Please log in to enable Kod AI.'
    )
  })
})
