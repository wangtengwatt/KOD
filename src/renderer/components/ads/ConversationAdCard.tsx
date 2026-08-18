import { ActionIcon, Box, Button, Flex, Stack, Text } from '@mantine/core'
import { IconExternalLink, IconSpeakerphone, IconX } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  type ConversationAd,
  type ConversationAdPlacement,
  isSafeConversationAdDestinationUrl,
} from '@/packages/advertising/conversationAds'
import { trackingEvent } from '@/packages/event'
import platform from '@/platform'

interface ConversationAdCardProps {
  ad: ConversationAd
  className?: string
  impressionKey: string
  placement: ConversationAdPlacement
}

const trackedImpressionKeys = new Set<string>()
const dismissedImpressionKeys = new Set<string>()

export function ConversationAdErrorFallback(): null {
  return null
}

function rememberKey(keys: Set<string>, key: string): boolean {
  if (keys.has(key)) return false
  keys.add(key)
  return true
}

function trackAdEvent(name: string, adId: string, placement: ConversationAdPlacement) {
  try {
    trackingEvent(name, {
      ad_id: adId,
      placement,
      platform: platform.type,
    })
  } catch {
    // Analytics must never affect the conversation UI.
  }
}

export default function ConversationAdCard({ ad, className, impressionKey, placement }: ConversationAdCardProps) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(() => dismissedImpressionKeys.has(impressionKey))
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (dismissed || trackedImpressionKeys.has(impressionKey)) return

    const card = cardRef.current
    if (!card || typeof IntersectionObserver === 'undefined') {
      if (rememberKey(trackedImpressionKeys, impressionKey)) {
        trackAdEvent('conversation_ad_impression', ad.id, placement)
      }
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      if (rememberKey(trackedImpressionKeys, impressionKey)) {
        trackAdEvent('conversation_ad_impression', ad.id, placement)
      }
      observer.disconnect()
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [ad.id, dismissed, impressionKey, placement])

  if (dismissed) return null

  const handleClick = () => {
    if (!isSafeConversationAdDestinationUrl(ad.destinationUrl)) return
    trackAdEvent('conversation_ad_click', ad.id, placement)
    void platform.openLink(ad.destinationUrl).catch(() => undefined)
  }

  const handleDismiss = () => {
    if (rememberKey(dismissedImpressionKeys, impressionKey)) {
      trackAdEvent('conversation_ad_dismiss', ad.id, placement)
    }
    setDismissed(true)
  }

  return (
    <aside
      ref={cardRef}
      aria-label="广告 · AD"
      data-testid="conversation-ad"
      className={cn('rounded-lg px-3 py-2.5', className)}
      style={{
        border: '1px solid var(--chatbox-border-primary)',
        backgroundColor: 'var(--chatbox-background-secondary)',
      }}
    >
      <Flex align="flex-start" gap="sm">
        <Box
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: 'var(--mantine-color-blue-light)' }}
        >
          <IconSpeakerphone size={17} className="text-[var(--mantine-color-blue-filled)]" />
        </Box>

        <Stack gap={2} className="min-w-0 flex-1">
          <Flex align="center" gap={6} wrap="wrap">
            <Text size="10px" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.08em' }}>
              广告 · AD
            </Text>
            <Text size="xs" c="dimmed">
              {ad.advertiser}
            </Text>
          </Flex>
          <Text size="sm" fw={600} lh={1.35}>
            {ad.title}
          </Text>
          <Text size="xs" c="dimmed" lh={1.45}>
            {ad.description}
          </Text>
          <Box mt={2}>
            <Button
              variant="subtle"
              size="compact-xs"
              px={0}
              rightSection={<IconExternalLink size={13} />}
              onClick={handleClick}
            >
              {ad.ctaLabel}
            </Button>
          </Box>
        </Stack>

        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={t('Dismiss')}
          title={t('Dismiss')}
          onClick={handleDismiss}
        >
          <IconX size={15} />
        </ActionIcon>
      </Flex>
    </aside>
  )
}
