import type { Message } from '@shared/types'
import type { PlatformType } from '@/platform/interfaces'

export type ConversationAdPlacement = 'chat-conversation' | 'task-conversation'

export interface ConversationAd {
  id: string
  advertiser: string
  title: string
  description: string
  ctaLabel: string
  destinationUrl: string
}

export interface ResolvedConversationAd {
  ad: ConversationAd
  anchorMessageId: string
}

type ConversationAdMessage = Pick<
  Message,
  'id' | 'role' | 'contentParts' | 'generating' | 'error' | 'errorCode' | 'finishReason' | 'isSummary'
>

interface ResolveConversationAdOptions {
  language: string
  placement: ConversationAdPlacement
  platformType: PlatformType
}

interface LocalizedAdCopy {
  title: string
  description: string
  ctaLabel: string
}

const KOD_HOUSE_AD_COPY: Record<'en' | 'zh', LocalizedAdCopy> = {
  en: {
    title: 'Turn ideas into working software faster',
    description: 'Plan, build, and ship with the KOD coding agent.',
    ctaLabel: 'Explore KOD',
  },
  zh: {
    title: '让想法更快变成可运行的软件',
    description: '使用 KOD 智能体完成规划、编码与交付。',
    ctaLabel: '了解 KOD',
  },
}

function isSupportedPlatform(platformType: PlatformType): boolean {
  return platformType === 'desktop' || platformType === 'web'
}

function hasVisibleAssistantOutput(message: ConversationAdMessage): boolean {
  return message.contentParts.some((part) => {
    if (part.type === 'image') return Boolean(part.storageKey)
    if (part.type === 'tool-call') return part.state === 'result'
    return part.text.trim().length > 0
  })
}

export function isSafeConversationAdDestinationUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

function getAdAnchorMessageId(messages: readonly ConversationAdMessage[]): string | null {
  const lastMessage = messages[messages.length - 1]
  if (
    !lastMessage ||
    lastMessage.role !== 'assistant' ||
    !hasVisibleAssistantOutput(lastMessage) ||
    lastMessage.generating ||
    lastMessage.error ||
    lastMessage.errorCode !== undefined ||
    lastMessage.finishReason !== 'stop' ||
    lastMessage.isSummary ||
    lastMessage.contentParts.some((part) => part.type === 'tool-call' && part.state === 'error')
  ) {
    return null
  }
  return lastMessage.id
}

function getKodHouseAd(language: string): ConversationAd {
  const copy = language.toLowerCase().startsWith('zh') ? KOD_HOUSE_AD_COPY.zh : KOD_HOUSE_AD_COPY.en
  return {
    id: 'kod-house-agent-2026-08',
    advertiser: 'KOD',
    ...copy,
    destinationUrl: 'https://kod.kai.com',
  }
}

/**
 * Resolves the one UI-only ad that may follow the latest completed assistant turn.
 * The placement is intentionally part of this boundary so a future remote provider
 * can return different inventory without changing either conversation renderer.
 */
export function resolveConversationAd(
  messages: readonly ConversationAdMessage[],
  options: ResolveConversationAdOptions
): ResolvedConversationAd | null {
  if (!isSupportedPlatform(options.platformType)) return null

  const anchorMessageId = getAdAnchorMessageId(messages)
  if (!anchorMessageId) return null

  const ad = getKodHouseAd(options.language)
  if (!isSafeConversationAdDestinationUrl(ad.destinationUrl)) return null

  return { ad, anchorMessageId }
}
