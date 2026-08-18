// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  observe: vi.fn(),
  openLink: vi.fn<() => Promise<void>>(),
  trackingEvent: vi.fn(),
}))

vi.mock('@/packages/event', () => ({ trackingEvent: mocks.trackingEvent }))
vi.mock('@/platform', () => ({ default: { type: 'web', openLink: mocks.openLink } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import type { ConversationAd } from '@/packages/advertising/conversationAds'
import ConversationAdCard from './ConversationAdCard'

const ad: ConversationAd = {
  id: 'kod-house-test',
  advertiser: 'KOD',
  title: 'Build with KOD',
  description: 'A test house ad.',
  ctaLabel: 'Explore KOD',
  destinationUrl: 'https://kod.kai.com',
}

interface ObserverRecord {
  callback: IntersectionObserverCallback
  observer: TestIntersectionObserver
}

const observers: ObserverRecord[] = []

class TestIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observers.push({ callback, observer: this })
  }

  observe = mocks.observe
  disconnect = mocks.disconnect
  unobserve = vi.fn()
  takeRecords = () => []
}

function renderCard(impressionKey: string, creative: ConversationAd = ad) {
  return render(
    <MantineProvider>
      <ConversationAdCard ad={creative} impressionKey={impressionKey} placement="chat-conversation" />
    </MantineProvider>
  )
}

function reportVisibility(isIntersecting: boolean) {
  const record = observers.at(-1)
  if (!record) throw new Error('Expected an IntersectionObserver')
  record.callback(
    [
      {
        isIntersecting,
        target: screen.getByTestId('conversation-ad'),
      } as unknown as IntersectionObserverEntry,
    ],
    record.observer as unknown as IntersectionObserver
  )
}

beforeEach(() => {
  observers.length = 0
  vi.clearAllMocks()
  mocks.openLink.mockResolvedValue(undefined)
  vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ConversationAdCard', () => {
  it('records one impression only after the card becomes visible', () => {
    renderCard('visible-once')

    expect(mocks.trackingEvent).not.toHaveBeenCalled()
    reportVisibility(false)
    expect(mocks.trackingEvent).not.toHaveBeenCalled()

    reportVisibility(true)
    reportVisibility(true)
    expect(mocks.trackingEvent).toHaveBeenCalledTimes(1)
    expect(mocks.trackingEvent).toHaveBeenCalledWith('conversation_ad_impression', {
      ad_id: 'kod-house-test',
      placement: 'chat-conversation',
      platform: 'web',
    })
  })

  it('deduplicates an impression when a virtualized row remounts', () => {
    const firstRender = renderCard('virtualized-remount')
    reportVisibility(true)
    firstRender.unmount()

    renderCard('virtualized-remount')
    reportVisibility(true)

    expect(mocks.trackingEvent).toHaveBeenCalledTimes(1)
  })

  it('keeps a dismissed placement hidden after remounting', () => {
    const firstRender = renderCard('dismiss-remount')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByTestId('conversation-ad')).toBeNull()
    expect(mocks.trackingEvent).toHaveBeenCalledWith('conversation_ad_dismiss', {
      ad_id: 'kod-house-test',
      placement: 'chat-conversation',
      platform: 'web',
    })

    firstRender.unmount()
    renderCard('dismiss-remount')
    expect(screen.queryByTestId('conversation-ad')).toBeNull()
    expect(mocks.trackingEvent).toHaveBeenCalledTimes(1)
  })

  it('opens a safe CTA and rejects an unsafe destination', () => {
    const safeRender = renderCard('safe-click')
    fireEvent.click(screen.getByRole('button', { name: 'Explore KOD' }))

    expect(mocks.openLink).toHaveBeenCalledWith('https://kod.kai.com')
    expect(mocks.trackingEvent).toHaveBeenCalledWith('conversation_ad_click', {
      ad_id: 'kod-house-test',
      placement: 'chat-conversation',
      platform: 'web',
    })

    safeRender.unmount()
    vi.clearAllMocks()
    renderCard('unsafe-click', { ...ad, destinationUrl: 'javascript:alert(1)' })
    fireEvent.click(screen.getByRole('button', { name: 'Explore KOD' }))

    expect(mocks.openLink).not.toHaveBeenCalled()
    expect(mocks.trackingEvent).not.toHaveBeenCalled()
  })
})
