import type { Message } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { isSafeConversationAdDestinationUrl, resolveConversationAd } from './conversationAds'

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    contentParts: [{ type: 'text', text: 'Done' }],
    finishReason: 'stop',
    ...overrides,
  }
}

const defaultOptions = {
  language: 'en',
  placement: 'chat-conversation' as const,
  platformType: 'desktop' as const,
}

describe('resolveConversationAd', () => {
  it.each(['desktop', 'web'] as const)('returns the KOD house ad on %s', (platformType) => {
    const result = resolveConversationAd([message()], { ...defaultOptions, platformType })

    expect(result).toMatchObject({
      anchorMessageId: 'assistant-1',
      ad: {
        id: 'kod-house-agent-2026-08',
        advertiser: 'KOD',
        destinationUrl: 'https://kod.kai.com',
      },
    })
  })

  it('does not return an ad on mobile', () => {
    expect(resolveConversationAd([message()], { ...defaultOptions, platformType: 'mobile' })).toBeNull()
  })

  it.each([
    message({ role: 'user' }),
    message({ contentParts: [] }),
    message({ contentParts: [{ type: 'text', text: '   ' }] }),
    message({ generating: true }),
    message({ error: 'Request failed' }),
    message({ errorCode: 500 }),
    message({ finishReason: undefined }),
    message({ isSummary: true }),
    message({ finishReason: 'content-filter' }),
    message({ finishReason: 'error' }),
    message({ finishReason: 'length' }),
    message({ finishReason: 'other' }),
    message({ finishReason: 'tool-calls' }),
    message({ finishReason: 'unknown' }),
    message({
      contentParts: [
        {
          type: 'tool-call',
          state: 'error',
          toolCallId: 'tool-1',
          toolName: 'sandbox_exec',
          args: {},
        },
      ],
    }),
  ])('does not return an ad after an ineligible last message', (lastMessage) => {
    expect(resolveConversationAd([lastMessage], defaultOptions)).toBeNull()
  })

  it('hides the previous ad as soon as a new user turn starts', () => {
    expect(resolveConversationAd([message(), message({ id: 'user-2', role: 'user' })], defaultOptions)).toBeNull()
  })

  it('uses Chinese copy for Chinese locales', () => {
    const result = resolveConversationAd([message()], { ...defaultOptions, language: 'zh-Hans' })

    expect(result?.ad.title).toBe('让想法更快变成可运行的软件')
    expect(result?.ad.ctaLabel).toBe('了解 KOD')
  })

  it('falls back to English copy for other locales', () => {
    const result = resolveConversationAd([message()], { ...defaultOptions, language: 'fr' })

    expect(result?.ad.title).toBe('Turn ideas into working software faster')
  })

  it.each([
    'http://kod.kai.com',
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://user:password@kod.kai.com',
    'not a url',
  ])('rejects an unsafe destination URL: %s', (url) => {
    expect(isSafeConversationAdDestinationUrl(url)).toBe(false)
  })

  it('accepts an HTTPS destination without embedded credentials', () => {
    expect(isSafeConversationAdDestinationUrl('https://kod.kai.com/product?source=conversation')).toBe(true)
  })
})
