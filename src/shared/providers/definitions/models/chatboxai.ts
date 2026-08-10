import type { AnthropicProviderOptions } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { type ModelMessage, streamText, type ToolSet } from 'ai'
import AbstractAISDKModel, { type CallSettings } from '../../../models/abstract-ai-sdk'
import { addAnthropicCacheControl } from '../../../models/anthropic-cache'
import type {
  CallChatCompletionOptions,
  ChatStreamOptions,
  ModelInterface,
  ModelStreamPart,
} from '../../../models/types'
import type { ChatboxAILicenseDetail, ProviderModelInfo, StreamTextResult } from '../../../types'
import type { ModelDependencies } from '../../../types/adapters'

interface Options {
  licenseKey?: string
  apiHost?: string
  apiKey?: string
  model: ProviderModelInfo
  licenseInstances?: {
    [key: string]: string
  }
  licenseDetail?: ChatboxAILicenseDetail
  language: string
  dalleStyle: 'vivid' | 'natural'
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  stream?: boolean
}

interface Config {
  uuid: string
}

/**
 * 从中转站（kai-new-api）返回的文本中提取 data URL 图片。
 * 网关会把 Gemini inlineData 转成：![image](data:image/png;base64,...)
 */
function extractImagesFromRelayText(text: string): string[] {
  if (!text) return []
  const images: string[] = []
  const regex = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/g
  let match = regex.exec(text)
  while (match !== null) {
    const mediaType = match[1]
    const base64 = match[2].replace(/\s+/g, '')
    if (base64) {
      images.push(`data:${mediaType};base64,${base64}`)
    }
    match = regex.exec(text)
  }
  return images
}

// 将chatboxAIFetch移到类内部作为私有方法
export default class ChatboxAI extends AbstractAISDKModel implements ModelInterface {
  public name = 'ChatboxAI'

  constructor(
    public options: Options,
    public config: Config,
    dependencies: ModelDependencies
  ) {
    options.stream = true
    super(options, dependencies)
  }

  private async chatboxAIFetch(url: RequestInfo | URL, options?: RequestInit) {
    return this.dependencies.request.fetchWithOptions(url.toString(), options, { parseChatboxRemoteError: true })
  }

  static isSupportTextEmbedding() {
    return true
  }

  protected getProvider(options: CallChatCompletionOptions) {
    const relayApiHost = this.options.apiHost?.replace(/\/+$/, '')
    if (!relayApiHost || !this.options.apiKey) {
      throw new Error('Kod AI relay station is not configured. Please log in to enable Kod AI.')
    }

    return createOpenAICompatible({
      name: 'KodAI',
      apiKey: this.options.apiKey,
      baseURL: relayApiHost,
      headers: {
        'chatbox-session-id': options.sessionId || '',
      },
      fetch: this.chatboxAIFetch.bind(this),
    })
  }

  protected getCallSettings(options: CallChatCompletionOptions): CallSettings {
    if (this.options.model.apiStyle === 'anthropic') {
      const isModelSupportReasoning = this.isSupportReasoning()
      let providerOptions = {} as { anthropic: AnthropicProviderOptions }
      if (isModelSupportReasoning) {
        providerOptions = {
          anthropic: {
            ...(options.providerOptions?.claude || {}),
          },
        }
      }
      // Anthropic API requires only one of temperature or topP
      const callSettings: CallSettings = {
        providerOptions,
        maxOutputTokens: this.options.maxOutputTokens,
      }
      if (this.options.temperature !== undefined) {
        callSettings.temperature = this.options.temperature
      } else if (this.options.topP !== undefined) {
        callSettings.topP = this.options.topP
      }
      return callSettings
    }
    return {
      temperature: this.options.temperature,
      topP: this.options.topP,
      maxOutputTokens: this.options.maxOutputTokens,
    }
  }

  getChatModel(options: CallChatCompletionOptions) {
    const provider = this.getProvider(options)
    return provider.languageModel(this.options.model.modelId)
  }

  // Image generation uses the relay's OpenAI-compatible chat completions endpoint.
  // kai-new-api converts Gemini inlineData to markdown data URLs, while some compatible
  // implementations return AI SDK file chunks, so paint supports both response forms.
  public async paint(
    params: {
      prompt: string
      images?: { imageUrl: string }[]
      num: number
      aspectRatio?: string
    },
    signal?: AbortSignal,
    callback?: (picBase64: string) => void | Promise<void>
  ): Promise<string[]> {
    const relayApiHost = this.options.apiHost?.replace(/\/+$/, '')
    if (!relayApiHost || !this.options.apiKey) {
      throw new Error('Kod AI relay station is not configured. Please log in to enable Kod AI image generation.')
    }

    const provider = createOpenAI({
      apiKey: this.options.apiKey,
      baseURL: relayApiHost,
      fetch: this.chatboxAIFetch.bind(this),
    })
    const model = provider.chat(this.options.model.modelId)

    const messageContent: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = []
    if (params.images && params.images.length > 0) {
      for (const img of params.images) {
        messageContent.push({ type: 'image', image: img.imageUrl })
      }
    }
    messageContent.push({ type: 'text', text: params.prompt })

    const results: string[] = []
    for (let i = 0; i < params.num; i++) {
      const result = streamText({
        model,
        messages: [{ role: 'user', content: messageContent }],
        abortSignal: signal,
        // Image generation is billable; network-error retries could double-charge.
        maxRetries: 0,
      })

      const textParts: string[] = []
      const seen = new Set<string>()
      const pushImage = async (dataUrl: string) => {
        if (seen.has(dataUrl)) return
        seen.add(dataUrl)
        results.push(dataUrl)
        await callback?.(dataUrl)
      }

      for await (const chunk of result.fullStream) {
        if (chunk.type === 'file' && chunk.file.mediaType?.startsWith('image/') && chunk.file.base64) {
          await pushImage(`data:${chunk.file.mediaType};base64,${chunk.file.base64}`)
        } else if (chunk.type === 'text-delta' && chunk.text) {
          // AI SDK v6: text-delta 字段是 `text`，不是 `textDelta`
          textParts.push(chunk.text)
        } else if (chunk.type === 'error') {
          console.error('[KodAI.paint] stream error:', chunk.error)
          throw chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error))
        }
      }

      // 中转站把图片嵌在文本里：![image](data:image/png;base64,...)
      for (const dataUrl of extractImagesFromRelayText(textParts.join(''))) {
        await pushImage(dataUrl)
      }
    }

    if (results.length === 0) {
      throw new Error(
        'No image returned from relay station. Make sure the selected model supports image generation (e.g. gemini-*-image*).'
      )
    }
    return results
  }

  public async chat(messages: ModelMessage[], options: CallChatCompletionOptions): Promise<StreamTextResult> {
    const cached = this.options.model.apiStyle === 'anthropic' ? addAnthropicCacheControl(messages) : messages
    return super.chat(cached, options)
  }

  public async *chatStream<T extends ToolSet>(
    messages: ModelMessage[],
    options: ChatStreamOptions
  ): AsyncGenerator<ModelStreamPart<T>> {
    const cached = this.options.model.apiStyle === 'anthropic' ? addAnthropicCacheControl(messages) : messages
    yield* super.chatStream<T>(cached, options)
  }

  isSupportSystemMessage() {
    return ![
      'o1-mini',
      'gemini-2.0-flash-exp',
      'gemini-2.0-flash-thinking-exp',
      'gemini-2.0-flash-exp-image-generation',
    ].includes(this.options.model.modelId)
  }

  public isSupportToolUse() {
    return true
  }
}
