// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletApiError } from '@/api/wallet'

const mocks = vi.hoisted(() => ({
  abandonRewardedAd: vi.fn(),
  claimRewardedAd: vi.fn(),
  completeRewardedAd: vi.fn(),
  getCardTimeAccount: vi.fn(),
  getRewardedAdStatus: vi.fn(),
  progressRewardedAd: vi.fn(),
  startRewardedAd: vi.fn(),
  trackingEvent: vi.fn(),
}))

vi.mock('@/api/wallet', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/wallet')>()
  return {
    ...original,
    walletApi: {
      ...original.walletApi,
      abandonRewardedAd: mocks.abandonRewardedAd,
      claimRewardedAd: mocks.claimRewardedAd,
      completeRewardedAd: mocks.completeRewardedAd,
      getCardTimeAccount: mocks.getCardTimeAccount,
      getRewardedAdStatus: mocks.getRewardedAdStatus,
      progressRewardedAd: mocks.progressRewardedAd,
      startRewardedAd: mocks.startRewardedAd,
    },
  }
})

vi.mock('@/packages/event', () => ({ trackingEvent: mocks.trackingEvent }))

import * as CardHourBusiness from '@/components/compute/CardHourBusiness'
import { walletKeys } from '@/hooks/useWallet'
import RewardedVideoCard from './RewardedVideoCard'

let monotonicClock = 0

const status = {
  campaignId: 'kod-reward-2026-08',
  rewardCardHours: 10,
  remainingCount: 1,
  durationSeconds: 3,
  minimumSeconds: 3,
  nextEligibleDate: '2026-08-21',
  eligible: true,
  videoUrl: 'https://api.kod.test/assets/rewarded-ad.mp4',
  posterUrl: 'https://api.kod.test/assets/rewarded-ad-poster.jpg',
}

const claimResult = {
  watchId: 17,
  rewardCardHours: 10,
  remainingCount: 0,
  nextEligibleDate: '2026-08-22',
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
    queryClient,
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

async function completeAdvertisement(video: HTMLVideoElement) {
  for (let second = 1; second <= status.durationSeconds; second += 1) {
    act(() => advancePlayback(video, second))
    await waitFor(() => expect(mocks.progressRewardedAd).toHaveBeenCalledTimes(second))
  }
  fireEvent.ended(video)
}

beforeEach(() => {
  monotonicClock = 0
  vi.clearAllMocks()
  mocks.getCardTimeAccount.mockResolvedValue({
    availableCardHours: 100,
    spendableCardHours: 100,
    redeemableCardHours: 90,
    rewardCardHours: 10,
  })
  mocks.getRewardedAdStatus.mockResolvedValue(status)
  mocks.abandonRewardedAd.mockImplementation(async (watchId: number) => ({
    watchId,
    abandonedAt: Math.floor(Date.now() / 1000),
  }))
  mocks.startRewardedAd.mockImplementation(async () => ({
    watchId: 17,
    campaignId: status.campaignId,
    videoUrl: status.videoUrl,
    minimumSeconds: status.minimumSeconds,
    startedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    progressToken: 'progress-0',
  }))
  mocks.progressRewardedAd.mockImplementation(async ({ watchId, mediaPositionSeconds, sequence }) => ({
    watchId,
    mediaPositionSeconds,
    sequence,
    nextProgressToken: `progress-${sequence}`,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  }))
  mocks.completeRewardedAd.mockResolvedValue({
    watchId: 17,
    completedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  })
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

  it('shows the three server account buckets and the non-redeemable reward policy', async () => {
    renderCard()

    expect(await screen.findByText('100 卡时')).toBeTruthy()
    expect(screen.getByText('90 卡时')).toBeTruthy()
    expect(screen.getByText('10 卡时')).toBeTruthy()
    expect(screen.getByText('奖励卡时仅限平台使用，不可回购成人民币')).toBeTruthy()
  })

  it('renders only the server campaign and requires verified progress plus completion before claim', async () => {
    renderCard()

    expect(await screen.findByText('+10 卡时')).toBeTruthy()
    expect(screen.getByText('今日可领取 1 次')).toBeTruthy()

    const video = await openAd()
    act(() => advancePlayback(video, 1))
    expect(mocks.claimRewardedAd).not.toHaveBeenCalled()

    fireEvent.ended(video)
    expect(mocks.completeRewardedAd).not.toHaveBeenCalled()
    expect(mocks.claimRewardedAd).not.toHaveBeenCalled()
    expect(await screen.findByText('服务端尚未确认完整播放，本次不能领取奖励。')).toBeTruthy()

    fireEvent.play(video)
    await completeAdvertisement(video)
    await waitFor(() => expect(mocks.completeRewardedAd).toHaveBeenCalledWith(17, 'progress-3'))
    await waitFor(() => expect(mocks.claimRewardedAd).toHaveBeenCalledTimes(1))
    expect(mocks.claimRewardedAd.mock.calls[0]?.[0]).toBe(17)
    expect(mocks.completeRewardedAd.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.claimRewardedAd.mock.invocationCallOrder[0]
    )
    await waitFor(() => expect(mocks.trackingEvent).toHaveBeenCalledTimes(3))
    expect(mocks.trackingEvent.mock.calls).toEqual([
      ['rewarded_ad_start', { campaign_id: 'kod-reward-2026-08', platform: 'web', reward_card_hours: '10' }],
      ['rewarded_ad_complete', { campaign_id: 'kod-reward-2026-08', platform: 'web', reward_card_hours: '10' }],
      ['rewarded_ad_claim', { campaign_id: 'kod-reward-2026-08', platform: 'web', reward_card_hours: '10' }],
    ])
  })

  it('drains sequential progress heartbeats when playback advances during network latency', async () => {
    const acceptedAt: number[] = []
    let resolveFirst:
      | ((receipt: {
          watchId: number
          mediaPositionSeconds: number
          sequence: number
          nextProgressToken: string
          expiresAt: number
        }) => void)
      | undefined
    mocks.progressRewardedAd
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockImplementation(({ watchId, mediaPositionSeconds, sequence }) => {
        const now = Date.now()
        if (now - (acceptedAt.at(-1) ?? 0) < 950) throw new Error('server rejected an early heartbeat')
        acceptedAt.push(now)
        return {
          watchId,
          mediaPositionSeconds,
          sequence,
          nextProgressToken: `progress-${sequence}`,
          expiresAt: Math.floor(now / 1000) + 600,
        }
      })
    renderCard()
    const video = await openAd()

    act(() => advancePlayback(video, 1))
    await waitFor(() => expect(mocks.progressRewardedAd).toHaveBeenCalledTimes(1))
    act(() => advancePlayback(video, 2))
    act(() => advancePlayback(video, 3))
    fireEvent.ended(video)
    expect(mocks.progressRewardedAd).toHaveBeenCalledTimes(1)

    await act(async () => {
      acceptedAt.push(Date.now())
      resolveFirst?.({
        watchId: 17,
        mediaPositionSeconds: 1,
        sequence: 1,
        nextProgressToken: 'progress-1',
        expiresAt: Math.floor(Date.now() / 1000) + 600,
      })
      await Promise.resolve()
    })

    await waitFor(() => expect(mocks.progressRewardedAd).toHaveBeenCalledTimes(3), { timeout: 3500 })
    expect(mocks.progressRewardedAd.mock.calls.map((call) => call[0].mediaPositionSeconds)).toEqual([1, 2, 3])
    expect(acceptedAt).toHaveLength(3)
    expect(acceptedAt[1] - acceptedAt[0]).toBeGreaterThanOrEqual(950)
    expect(acceptedAt[2] - acceptedAt[1]).toBeGreaterThanOrEqual(950)
    await waitFor(() => expect(mocks.completeRewardedAd).toHaveBeenCalledWith(17, 'progress-3'))
    await waitFor(() => expect(mocks.claimRewardedAd).toHaveBeenCalledTimes(1))
  })

  it('records one abandon event without sensitive fields', async () => {
    renderCard()
    await openAd()

    fireEvent.click(screen.getByRole('button', { name: '关闭并放弃' }))

    await waitFor(() => expect(mocks.abandonRewardedAd.mock.calls[0]?.[0]).toBe(17))
    expect(mocks.trackingEvent).toHaveBeenLastCalledWith('rewarded_ad_abandon', {
      campaign_id: 'kod-reward-2026-08',
      platform: 'web',
      reward_card_hours: '10',
    })
    expect(Object.keys(mocks.trackingEvent.mock.calls.at(-1)?.[1] ?? {})).toEqual([
      'campaign_id',
      'platform',
      'reward_card_hours',
    ])
  })

  it.each(['pause', 'visibility', 'buffering'] as const)(
    'abandons a stale watch after more than five seconds of %s and starts a fresh watch',
    async (interruption) => {
      let startCount = 0
      mocks.startRewardedAd.mockImplementation(() => {
        startCount += 1
        return {
          watchId: startCount === 1 ? 17 : 18,
          campaignId: status.campaignId,
          videoUrl: status.videoUrl,
          minimumSeconds: status.minimumSeconds,
          startedAt: Math.floor(Date.now() / 1000),
          expiresAt: Math.floor(Date.now() / 1000) + 600,
          progressToken: `watch-${startCount}-progress-0`,
        }
      })
      mocks.progressRewardedAd
        .mockResolvedValueOnce({
          watchId: 17,
          mediaPositionSeconds: 1,
          sequence: 1,
          nextProgressToken: 'watch-1-progress-1',
          expiresAt: Math.floor(Date.now() / 1000) + 600,
        })
        .mockRejectedValueOnce(new WalletApiError('Advertisement progress window has elapsed', 'business', 409))
      renderCard()
      const video = await openAd()

      act(() => advancePlayback(video, 1))
      await waitFor(() => expect(mocks.progressRewardedAd).toHaveBeenCalledTimes(1))
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      if (interruption === 'pause') {
        fireEvent.pause(video)
      } else if (interruption === 'visibility') {
        let hidden = true
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
        fireEvent(document, new Event('visibilitychange'))
        hidden = false
        fireEvent(document, new Event('visibilitychange'))
      } else {
        fireEvent.waiting(video)
      }

      monotonicClock = 8_000
      fireEvent.play(video)
      video.currentTime = 2
      monotonicClock = 9_000
      fireEvent.timeUpdate(video)

      await waitFor(() => expect(mocks.progressRewardedAd).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(mocks.abandonRewardedAd.mock.calls[0]?.[0]).toBe(17))
      expect(await screen.findByText('观看中断超过 5 秒，本次未发放奖励，请重新开始。')).toBeTruthy()
      await waitFor(() => expect(screen.queryByLabelText('奖励广告视频')).toBeNull())

      fireEvent.click(screen.getByRole('button', { name: '观看并领取' }))
      const replacement = (await screen.findByLabelText('奖励广告视频')) as HTMLVideoElement
      expect(mocks.startRewardedAd).toHaveBeenCalledTimes(2)
      fireEvent.play(replacement)
      replacement.currentTime = 1
      monotonicClock = 10_000
      fireEvent.timeUpdate(replacement)
      await waitFor(() =>
        expect(mocks.progressRewardedAd.mock.calls.at(-1)?.[0]).toEqual(
          expect.objectContaining({ watchId: 18, progressToken: 'watch-2-progress-0' })
        )
      )
    }
  )

  it('does not claim when ended before the full server asset duration', async () => {
    renderCard()
    const video = await openAd()

    act(() => advancePlayback(video, 1))
    fireEvent.ended(video)

    expect(mocks.claimRewardedAd).not.toHaveBeenCalled()
    expect(await screen.findByText('服务端尚未确认完整播放，本次不能领取奖励。')).toBeTruthy()
  })

  it('does not claim when the completion receipt belongs to another watch', async () => {
    mocks.completeRewardedAd.mockResolvedValueOnce({
      watchId: 99,
      completedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    })
    renderCard()
    const video = await openAd()

    await completeAdvertisement(video)

    expect(await screen.findByText('完整播放确认失败：服务端返回了不匹配的播放完成回执')).toBeTruthy()
    expect(mocks.claimRewardedAd).not.toHaveBeenCalled()
  })

  it('pauses on window blur and excludes unfocused time from eligibility', async () => {
    renderCard()
    const video = await openAd()

    act(() => advancePlayback(video, 1))
    fireEvent(window, new Event('blur'))
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(screen.getByText('窗口失去焦点时广告已暂停，离开期间不会累计时长。')).toBeTruthy()

    act(() => advancePlayback(video, 3))
    fireEvent.ended(video)

    expect(mocks.claimRewardedAd).not.toHaveBeenCalled()
    expect(await screen.findByText('服务端尚未确认完整播放，本次不能领取奖励。')).toBeTruthy()
  })

  it('keeps the active segment when stalled media continues from cache without another playing event', async () => {
    renderCard()
    const video = await openAd()

    act(() => advancePlayback(video, 1))
    await waitFor(() => expect(mocks.progressRewardedAd).toHaveBeenCalledTimes(1))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    fireEvent.stalled(video)
    act(() => advancePlayback(video, 2))

    await waitFor(() => expect(mocks.progressRewardedAd).toHaveBeenCalledTimes(2))
    expect(mocks.progressRewardedAd.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ mediaPositionSeconds: 2, sequence: 2, progressToken: 'progress-1' })
    )
    expect(screen.getByText('有效观看 2/3 秒')).toBeTruthy()
  })

  it('deduplicates repeated ended events after becoming eligible', async () => {
    const onClaimed = vi.fn()
    renderCard(onClaimed)
    const video = await openAd()

    await completeAdvertisement(video)
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

    await completeAdvertisement(video)

    expect(await screen.findByText('临时网络错误')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试领取' }))

    await waitFor(() => expect(mocks.claimRewardedAd).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onClaimed).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('领取成功')).toBeTruthy()
  })

  it('shows the exact server claim receipt and invalidates account, ad status, and asset history', async () => {
    const { queryClient } = renderCard()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const video = await openAd()

    await completeAdvertisement(video)

    expect(await screen.findByText('10 卡时已到账')).toBeTruthy()
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: walletKeys.cardTimeAccount('member@kod.test') })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: walletKeys.rewardedAdStatus('member@kod.test') })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['compute', 'member@kod.test', 'account'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['compute', 'member@kod.test', 'ledger'] })
    })
  })

  it('renders qualified balances in the compute card-hour business without merging reward into redeemable', () => {
    expect(CardHourBusiness.CardHourBalanceSummary).toBeDefined()
    const CardHourBalanceSummary = CardHourBusiness.CardHourBalanceSummary as ComponentType<{
      account: { spendableCardHours: number; redeemableCardHours: number; rewardCardHours: number }
    }>
    render(
      <MantineProvider>
        <CardHourBalanceSummary account={{ spendableCardHours: 100, redeemableCardHours: 90, rewardCardHours: 10 }} />
      </MantineProvider>
    )

    expect(screen.getByText('可消费卡时')).toBeTruthy()
    expect(screen.getByText('可回购卡时')).toBeTruthy()
    expect(screen.getByText('奖励卡时')).toBeTruthy()
    expect(screen.getByText('奖励卡时仅限平台使用，不可回购成人民币')).toBeTruthy()
  })
})
