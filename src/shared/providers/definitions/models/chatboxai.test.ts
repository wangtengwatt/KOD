import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { CallChatCompletionOptions } from '@shared/models/types'
import type { ChatboxAILicenseDetail, ProviderModelInfo } from '@shared/types'
import type { ModelDependencies } from '@shared/types/adapters'
import type { SentryScope } from '@shared/utils/sentry_adapter'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatboxAI from './chatboxai'

const mocks = vi.hoisted(() => {
  const languageModel: LanguageModelV3 = {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test-model',
    supportedUrls: {},
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  }
  const compatibleLanguageModel = vi.fn(() => languageModel)
  const createOpenAICompatible = vi.fn(() => ({ languageModel: compatibleLanguageModel }))
  const chat = vi.fn(() => languageModel)
  const createOpenAI = vi.fn(() => ({ chat }))
  const streamText = vi.fn()

  return { chat, compatibleLanguageModel, createOpenAI, createOpenAICompatible, languageModel, streamText }
})

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: mocks.createOpenAICompatible,
}))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.createOpenAI }))
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: mocks.streamText,
}))

class TestChatboxAI extends ChatboxAI {
  public exposeProvider(options: CallChatCompletionOptions) {
    return this.getProvider(options)
  }
}

function createDependencies(): ModelDependencies {
  return {
    request: { apiRequest: vi.fn(), fetchWithOptions: vi.fn() },
    storage: { saveImage: vi.fn(), getImage: vi.fn() },
    sentry: {
      captureException: vi.fn(),
      withScope: vi.fn((callback: (scope: SentryScope) => void) => callback({ setTag: vi.fn(), setExtra: vi.fn() })),
    },
    getRemoteConfig: vi.fn(),
    platformType: 'desktop',
  }
}

function createModel(overrides: Partial<ConstructorParameters<typeof TestChatboxAI>[0]> = {}) {
  return new TestChatboxAI(
    {
      licenseKey: 'legacy-license',
      licenseInstances: { 'legacy-license': 'legacy-instance' },
      licenseDetail: {} as ChatboxAILicenseDetail,
      apiHost: 'https://relay.example.com/v1/',
      apiKey: 'relay-key',
      model: { modelId: 'gemini-2.5-flash-image', type: 'image' } as ProviderModelInfo,
      language: 'en',
      dalleStyle: 'vivid',
      ...overrides,
    },
    { uuid: 'test-uuid' },
    createDependencies()
  )
}

function stream(...chunks: unknown[]) {
  mocks.streamText.mockReturnValue({
    fullStream: (async function* () {
      yield* chunks
    })(),
  })
}

describe('ChatboxAI relay provider', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a relay provider with a normalized URL and session header', () => {
    const model = createModel()

    model.exposeProvider({ sessionId: 'session-123' })

    expect(mocks.createOpenAICompatible).toHaveBeenCalledWith({
      name: 'KodAI',
      apiKey: 'relay-key',
      baseURL: 'https://relay.example.com/v1',
      headers: { 'chatbox-session-id': 'session-123' },
      fetch: expect.any(Function),
    })
  })

  it('uses the relay language model regardless of legacy apiStyle metadata', () => {
    const model = createModel({ model: { modelId: 'claude-relayed', type: 'chat', apiStyle: 'anthropic' } })

    expect(model.getChatModel({ sessionId: 'session-123' })).toBe(mocks.languageModel)
    expect(mocks.compatibleLanguageModel).toHaveBeenCalledWith('claude-relayed')
  })

  it.each([
    [{ apiHost: undefined }, 'Kod AI relay station is not configured. Please log in to enable Kod AI.'],
    [{ apiKey: undefined }, 'Kod AI relay station is not configured. Please log in to enable Kod AI.'],
  ])('rejects incomplete relay configuration %o', (overrides, message) => {
    expect(() => createModel(overrides).exposeProvider({})).toThrow(message)
    expect(mocks.createOpenAICompatible).not.toHaveBeenCalled()
  })
})

describe('ChatboxAI relay image generation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('extracts split markdown data URLs, strips whitespace, and invokes the callback', async () => {
    stream({ type: 'text-delta', text: '![image](data:image/png;base64,aG' }, { type: 'text-delta', text: 'Vs bG8=)' })
    const callback = vi.fn()

    const result = await createModel().paint({ prompt: 'draw', num: 1 }, undefined, callback)

    expect(result).toEqual(['data:image/png;base64,aGVsbG8='])
    expect(callback).toHaveBeenCalledWith('data:image/png;base64,aGVsbG8=')
    expect(mocks.createOpenAI).toHaveBeenCalledWith({
      apiKey: 'relay-key',
      baseURL: 'https://relay.example.com/v1',
      fetch: expect.any(Function),
    })
    expect(mocks.chat).toHaveBeenCalledWith('gemini-2.5-flash-image')
  })

  it('supports file chunks and deduplicates identical text and file images per generation', async () => {
    stream(
      { type: 'file', file: { mediaType: 'image/webp', base64: 'YWJj' } },
      { type: 'text-delta', text: '![image](data:image/webp;base64,YWJj)' }
    )

    const result = await createModel().paint({ prompt: 'draw', num: 1 })

    expect(result).toEqual(['data:image/webp;base64,YWJj'])
  })

  it('passes image inputs, abort signal, and disables retries', async () => {
    stream({ type: 'file', file: { mediaType: 'image/png', base64: 'YWJj' } })
    const signal = new AbortController().signal

    await createModel().paint(
      { prompt: 'edit', images: [{ imageUrl: 'data:image/png;base64,c291cmNl' }], num: 1 },
      signal
    )

    expect(mocks.streamText).toHaveBeenCalledWith({
      model: mocks.languageModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: 'data:image/png;base64,c291cmNl' },
            { type: 'text', text: 'edit' },
          ],
        },
      ],
      abortSignal: signal,
      maxRetries: 0,
    })
  })

  it('runs the requested number of relay generations', async () => {
    mocks.streamText
      .mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'file', file: { mediaType: 'image/png', base64: 'b25l' } }
        })(),
      })
      .mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'file', file: { mediaType: 'image/png', base64: 'dHdv' } }
        })(),
      })

    const result = await createModel().paint({ prompt: 'draw', num: 2 })

    expect(result).toEqual(['data:image/png;base64,b25l', 'data:image/png;base64,dHdv'])
    expect(mocks.streamText).toHaveBeenCalledTimes(2)
  })

  it('throws relay stream errors', async () => {
    stream({ type: 'error', error: new Error('relay failed') })

    await expect(createModel().paint({ prompt: 'draw', num: 1 })).rejects.toThrow('relay failed')
  })

  it('throws when the relay returns no image', async () => {
    stream({ type: 'text-delta', text: 'text only' })

    await expect(createModel().paint({ prompt: 'draw', num: 1 })).rejects.toThrow(
      'No image returned from relay station.'
    )
  })

  it('rejects incomplete relay configuration before creating an image provider', async () => {
    await expect(createModel({ apiKey: undefined }).paint({ prompt: 'draw', num: 1 })).rejects.toThrow(
      'Kod AI relay station is not configured.'
    )
    expect(mocks.createOpenAI).not.toHaveBeenCalled()
  })
})
