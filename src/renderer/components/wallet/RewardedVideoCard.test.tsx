// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletApiError } from '@/api/wallet'

const mocks = vi.hoisted(() => ({
  claimRewardedAd: vi.fn(),
  getRewardedAdStatus: vi.fn(),
  startRewardedAd: vi.fn(),
  trackingEvent: vi.fn(),
}))

vi.mock('@/api/wallet', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/wallet')>()
  return {
    ...original,
    walletApi: {
      ...original.walletApi,
      claimRewardedAd: mocks.claimRewardedAd,
      getRewardedAdStatus: mocks.getRewardedAdStatus,
      startRewardedAd: mocks.startRewardedAd,
    },
  }
})

vi.mock('@/packages/event', () => ({ trackingEvent: mocks.trackingEvent }))

import RewardedVideoCard from './RewardedVideoCard'

let monotonicClock = 0

const status = {
  enabled: true,
  campaignId: 'kod-reward-2026-08',
  rewardCardHours: 0.1,
  dailyLimit: 3,
  claimedToday: 1,
  remainingToday: 2,
  minWatchSeconds: 90,
  nextAvailableAt: null,
  videoUrl: 'https://api.kod.test/assets/rewarded-ad.mp4',
  posterUrl: 'https://api.kod.test/assets/rewarded-ad-poster.jpg',
}

const claimResult = {
  duplicated: false,
  rewardCardHours: 0.1,
  availableCardHours: 1.2,
  claimedToday: 2,
  remainingToday: 1,
  nextAvailableAt: null,
}

function renderCard(onClaimed = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
  return {
    onClaimed,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <RewardedVideoCard identity="member@kod.test" onClaimed={onClaimed} />
        </MantineProvider>
      </QueryClientProvider>
    ),
  }
}

async function openAd() {
  const action = await screen.findByRole('button', { name: '观看并领取' })
  fireEvent.click(action)
  const video = (await screen.findByLabelText('奖励广告视频')) as HTMLVideoElement
  fireEvent.play(video)
  return video
}

function advancePlayback(video: HTMLVideoElement, seconds: number) {
  monotonicClock = seconds * 1000
  video.currentTime = seconds
  fireEvent.timeUpdate(video)
}

beforeEach(() => {
  monotonicClock = 0
  vi.clearAllMocks()
  mocks.getRewardedAdStatus.mockResolvedValue(status)
  mocks.startRewardedAd.mockImplementation(async () => ({
    watchId: '11111111-1111-4111-8111-111111111111',
    campaignId: status.campaignId,
    rewardCardHours: status.rewardCardHours,
    minWatchSeconds: status.minWatchSeconds,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  }))
  mocks.claimRewardedAd.mockResolvedValue(claimResult)
  vi.spyOn(performance, 'now').mockImplementation(() => monotonicClock)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
  )
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('RewardedVideoCard', () => {
  it('labels the placement as an ad in the card and player', async () => {
    renderCard()

    expect(await screen.findByText('广告 · AD')).toBeTruthy()

    await openAd()
    expect(screen.getAllByText('广告 · AD')).toHaveLength(2)
  })

  it('renders a non-fatal not-deployed state without retrying automatically', async () => {
    mocks.getRewardedAdStatus.mockRejectedValue(
      new WalletApiError('当前服务端尚未开通卡时奖励', 'unsupported', undefined, 500)
    )
    renderCard()

    expect(await screen.findByText('服务端尚未开通')).toBeTruthy()
    expect(screen.getByText('当前服务端尚未开通卡时奖励')).toBeTruthy()
    expect(mocks.getRewardedAdStatus).toHaveBeenCalledTimes(1)
  })

  it('renders only the server reward and requires both valid time and ended', async () => {
    renderCard()

    expect(await screen.findByText('+0.1 卡时')).toBeTruthy()
    expect(screen.getByText('今日剩余 2/3 次')).toBeTruthy()

    const video = await openAd()
    act(() => advancePlayback(video, 90))
    expect(mocks.claimRewardedAd).not.toHaveBeenCalled()

    fireEvent.ended(video)
    await waitFor(() => expect(mocks.claimRewardedAd).toHaveBeenCalledTimes(1))
    expect(mocks.claimRewardedAd.mock.calls[0]?.[0]).toBe('11111111-1111-4111-8111-111111111111')
    await waitFor(() => expect(mocks.trackingEvent).toHaveBeenCalledTimes(3))
    expect(mocks.trackingEvent.mock.calls).toEqual([
      ['rewarded_ad_start', { campaign_id: 'kod-reward-2026-08', platform: 'web', reward_card_hours: '0.1' }],
      ['rewarded_ad_complete', { campaign_id: 'kod-reward-2026-08', platform: 'web', reward_card_hours: '0.1' }],
      ['rewarded_ad_claim', { campaign_id: 'kod-reward-2026-08', platform: 'web', reward_card_hours: '0.1' }],
    ])
  })

  it('records one abandon event without sensitive fields', async () => {
    renderCard()
    await openAd()

    fireEvent.click(screen.getByRole('button', { name: '关闭并放弃' }))

    expect(mocks.trackingEvent).toHaveBeenLastCalledWith('rewarded_ad_abandon', {
      campaign_id: 'kod-reward-2026-08',
      platform: 'web',
      reward_card_hours: '0.1',
    })
    expect(Object.keys(mocks.trackingEvent.mock.calls.at(-1)?.[1] ?? {})).toEqual([
      'campaign_id',
      'platform',
      'reward_card_hours',
    ])
  })

  it('does not claim when ended before 90 seconds of valid playback', async () => {
    renderCard()
    const video = await openAd()

    act(() => advancePlayback(video, 89))
    fireEvent.ended(video)

    expect(mocks.claimRewardedAd).not.toHaveBeenCalled()
    expect(await screen.findByText('有效观看不足 90 秒，本次不能领取奖励。')).toBeTruthy()
  })

  it('pauses on window blur and excludes unfocused time from eligibility', async () => {
    renderCard()
    const video = await openAd()

    act(() => advancePlayback(video, 45))
    fireEvent(window, new Event('blur'))
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(screen.getByText('窗口失去焦点时广告已暂停，离开期间不会累计时长。')).toBeTruthy()

    act(() => advancePlayback(video, 90))
    fireEvent.ended(video)

    expect(mocks.claimRewardedAd).not.toHaveBeenCalled()
    expect(await screen.findByText('有效观看不足 90 秒，本次不能领取奖励。')).toBeTruthy()
  })

  it('deduplicates repeated ended events after becoming eligible', async () => {
    const onClaimed = vi.fn()
    renderCard(onClaimed)
    const video = await openAd()

    act(() => advancePlayback(video, 90))
    fireEvent.ended(video)
    fireEvent.ended(video)

    await waitFor(() => expect(mocks.claimRewardedAd).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onClaimed).toHaveBeenCalledTimes(1))
    expect(onClaimed).toHaveBeenCalledWith(claimResult)
  })

  it('allows an explicit retry after a claim failure without duplicate success', async () => {
    const onClaimed = vi.fn()
    mocks.claimRewardedAd.mockRejectedValueOnce(new Error('临时网络错误')).mockResolvedValueOnce(claimResult)
    renderCard(onClaimed)
    const video = await openAd()

    act(() => advancePlayback(video, 90))
    fireEvent.ended(video)

    expect(await screen.findByText('临时网络错误')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试领取' }))

    await waitFor(() => expect(mocks.claimRewardedAd).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onClaimed).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('领取成功')).toBeTruthy()
  })
})
