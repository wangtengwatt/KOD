import { Alert, Badge, Box, Button, Card, Group, Loader, Progress, Stack, Text, Title } from '@mantine/core'
import { IconCheck, IconGift, IconPlayerPause, IconPlayerPlay, IconRefresh } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { RewardedAdClaim, RewardedAdWatch } from '@/api/wallet'
import {
  REWARDED_AD_PROGRESS_WINDOW_ELAPSED_CODE,
  REWARDED_AD_PROGRESS_WINDOW_ELAPSED_MESSAGE,
  WalletApiError,
  walletApi,
} from '@/api/wallet'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { invalidateRewardReceipt, walletKeys } from '@/hooks/useWallet'
import { trackingEvent } from '@/packages/event'
import platform from '@/platform'
import { formatCardTime } from '@/utils/wallet.utils'

export const MINIMUM_REWARDED_WATCH_SECONDS = 90

const MEDIA_LEAD_TOLERANCE_SECONDS = 0.75

interface PlaybackSegment {
  mediaStartedAt: number
  trustedMediaTime: number
  wallStartedAt: number
}

export interface RewardedVideoCardProps {
  identity: string
  onClaimed?: (claim: RewardedAdClaim) => undefined | Promise<unknown>
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '请求失败，请稍后重试')

const isElapsedProgressWindow = (error: unknown) =>
  error instanceof WalletApiError &&
  error.kind === 'business' &&
  error.businessCode === REWARDED_AD_PROGRESS_WINDOW_ELAPSED_CODE &&
  error.message === REWARDED_AD_PROGRESS_WINDOW_ELAPSED_MESSAGE

const monotonicNow = () => (typeof performance === 'undefined' ? Date.now() : performance.now())

const trackRewardedAd = (
  event: 'rewarded_ad_start' | 'rewarded_ad_complete' | 'rewarded_ad_claim' | 'rewarded_ad_abandon',
  watch: RewardedAdWatch,
  rewardCardHours: number
) =>
  trackingEvent(event, {
    campaign_id: watch.campaignId,
    platform: platform.type,
    reward_card_hours: String(rewardCardHours),
  })

export function RewardedVideoCard({ identity, onClaimed }: RewardedVideoCardProps) {
  const queryClient = useQueryClient()
  const titleId = useId()
  const descriptionId = useId()
  const watchHelpId = useId()
  const [opened, setOpened] = useState(false)
  const [watch, setWatch] = useState<RewardedAdWatch | null>(null)
  const [videoSource, setVideoSource] = useState<{ posterUrl: string; videoUrl: string } | null>(null)
  const [validMilliseconds, setValidMilliseconds] = useState(0)
  const [hasEnded, setHasEnded] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimResult, setClaimResult] = useState<RewardedAdClaim | null>(null)
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const watchRef = useRef<RewardedAdWatch | null>(null)
  const segmentRef = useRef<PlaybackSegment | null>(null)
  const creditedMillisecondsRef = useRef(0)
  const effectiveMillisecondsRef = useRef(0)
  const trustedMediaTimeRef = useRef(0)
  const correctionTargetRef = useRef<number | null>(null)
  const resumeAfterSeekRef = useRef(false)
  const endedRef = useRef(false)
  const eligibleRef = useRef(false)
  const autoClaimAttemptedRef = useRef(false)
  const completionTrackedRef = useRef(false)
  const abandonTrackedRef = useRef(false)
  const claimStateRef = useRef<'idle' | 'pending' | 'succeeded'>('idle')
  const serverProgressPositionRef = useRef(0)
  const serverProgressTargetRef = useRef(0)
  const serverProgressSequenceRef = useRef(0)
  const progressTokenRef = useRef('')
  const progressInFlightRef = useRef<Promise<boolean> | null>(null)

  const status = useQuery({
    queryKey: walletKeys.rewardedAdStatus(identity),
    queryFn: walletApi.getRewardedAdStatus,
    enabled: Boolean(identity),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const account = useQuery({
    queryKey: walletKeys.cardTimeAccount(identity),
    queryFn: walletApi.getCardTimeAccount,
    enabled: Boolean(identity),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const start = useMutation({ mutationFn: walletApi.startRewardedAd })
  const progress = useMutation({ mutationFn: walletApi.progressRewardedAd })
  const abandon = useMutation({ mutationFn: walletApi.abandonRewardedAd })
  const complete = useMutation({
    mutationFn: ({ watchId, progressToken }: { watchId: number; progressToken: string }) =>
      walletApi.completeRewardedAd(watchId, progressToken),
  })
  const claim = useMutation({ mutationFn: walletApi.claimRewardedAd })

  const requiredSeconds = watch?.minimumSeconds ?? status.data?.minimumSeconds ?? MINIMUM_REWARDED_WATCH_SECONDS
  const assetDurationSeconds = status.data?.durationSeconds ?? requiredSeconds
  const requiredMilliseconds = requiredSeconds * 1000
  const watchExpired = Boolean(watch?.expiresAt && Date.now() / 1000 >= watch.expiresAt)

  const publishProgress = useCallback(
    (milliseconds: number) => {
      const bounded = Math.max(0, Math.min(milliseconds, requiredMilliseconds))
      effectiveMillisecondsRef.current = bounded
      setValidMilliseconds(bounded)
      return bounded
    },
    [requiredMilliseconds]
  )

  const segmentProgress = useCallback((segment: PlaybackSegment, mediaTime: number, wallTime: number) => {
    const wallMilliseconds = Math.max(0, wallTime - segment.wallStartedAt)
    const mediaMilliseconds = Math.max(0, (mediaTime - segment.mediaStartedAt) * 1000)
    return Math.min(wallMilliseconds, mediaMilliseconds)
  }, [])

  const settleSegment = useCallback(
    (video: HTMLVideoElement, mediaTime = video.currentTime) => {
      const segment = segmentRef.current
      if (!segment) return effectiveMillisecondsRef.current
      creditedMillisecondsRef.current += segmentProgress(segment, mediaTime, monotonicNow())
      segmentRef.current = null
      return publishProgress(creditedMillisecondsRef.current)
    },
    [publishProgress, segmentProgress]
  )

  const beginSegment = useCallback((video: HTMLVideoElement) => {
    if (segmentRef.current) return
    segmentRef.current = {
      mediaStartedAt: video.currentTime,
      trustedMediaTime: video.currentTime,
      wallStartedAt: monotonicNow(),
    }
    trustedMediaTimeRef.current = video.currentTime
  }, [])

  const stopInvalidPlayback = useCallback(
    (video: HTMLVideoElement, message: string) => {
      const trustedMediaTime = segmentRef.current?.trustedMediaTime ?? trustedMediaTimeRef.current
      settleSegment(video, trustedMediaTime)
      correctionTargetRef.current = trustedMediaTime
      video.currentTime = trustedMediaTime
      video.pause()
      setIsPlaying(false)
      setPlaybackNotice(message)
    },
    [settleSegment]
  )

  const resetPlayback = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.playbackRate = 1
    }
    watchRef.current = null
    segmentRef.current = null
    creditedMillisecondsRef.current = 0
    effectiveMillisecondsRef.current = 0
    trustedMediaTimeRef.current = 0
    correctionTargetRef.current = null
    resumeAfterSeekRef.current = false
    endedRef.current = false
    eligibleRef.current = false
    autoClaimAttemptedRef.current = false
    completionTrackedRef.current = false
    abandonTrackedRef.current = false
    claimStateRef.current = 'idle'
    serverProgressPositionRef.current = 0
    serverProgressTargetRef.current = 0
    serverProgressSequenceRef.current = 0
    progressTokenRef.current = ''
    progressInFlightRef.current = null
    setWatch(null)
    setVideoSource(null)
    setValidMilliseconds(0)
    setHasEnded(false)
    setIsPlaying(false)
    setPlaybackNotice(null)
    setVideoError(null)
    setClaimError(null)
    setClaimResult(null)
    start.reset()
    progress.reset()
    abandon.reset()
    complete.reset()
    claim.reset()
  }, [abandon, claim, complete, progress, start])

  const attemptClaim = useCallback(async () => {
    const activeWatch = watchRef.current
    if (!activeWatch || !endedRef.current || !eligibleRef.current) return
    if (claimStateRef.current !== 'idle') return
    if (activeWatch.expiresAt > 0 && Date.now() / 1000 >= activeWatch.expiresAt) {
      setClaimError('本次广告已过期，请关闭后重新观看。')
      return
    }

    claimStateRef.current = 'pending'
    setClaimError(null)
    try {
      const result = await claim.mutateAsync(activeWatch.watchId)
      claimStateRef.current = 'succeeded'
      trackRewardedAd('rewarded_ad_claim', activeWatch, result.rewardCardHours)
      setClaimResult(result)
      await invalidateRewardReceipt(queryClient, identity)
      if (onClaimed)
        void Promise.resolve()
          .then(() => onClaimed(result))
          .catch(() => undefined)
    } catch (error) {
      claimStateRef.current = 'idle'
      setClaimError(errorMessage(error))
    }
  }, [claim, identity, onClaimed, queryClient])

  const handleStart = useCallback(async () => {
    const currentStatus = status.data
    if (!currentStatus?.eligible || currentStatus.remainingCount <= 0) return

    try {
      const activeWatch = await start.mutateAsync(currentStatus.campaignId)
      resetPlayback()
      setRecoveryNotice(null)
      watchRef.current = activeWatch
      progressTokenRef.current = activeWatch.progressToken
      setWatch(activeWatch)
      setVideoSource({ posterUrl: currentStatus.posterUrl ?? '', videoUrl: activeWatch.videoUrl })
      setOpened(true)
      trackRewardedAd('rewarded_ad_start', activeWatch, currentStatus.rewardCardHours)
    } catch {
      // Mutation state renders the server-provided error below the action.
    }
  }, [resetPlayback, start, status.data])

  const abandonWatch = useCallback(
    async (activeWatch: RewardedAdWatch, notice: string | null) => {
      try {
        const receipt = await abandon.mutateAsync(activeWatch.watchId)
        if (receipt.watchId !== activeWatch.watchId) throw new Error('服务端返回了不匹配的放弃回执')
        if (!abandonTrackedRef.current) {
          abandonTrackedRef.current = true
          trackRewardedAd('rewarded_ad_abandon', activeWatch, status.data?.rewardCardHours ?? 0)
        }
        setOpened(false)
        resetPlayback()
        setRecoveryNotice(notice)
        await queryClient.invalidateQueries({ queryKey: walletKeys.rewardedAdStatus(identity) })
        return true
      } catch (error) {
        setClaimError(`放弃本次观看失败：${errorMessage(error)}`)
        return false
      }
    },
    [abandon, identity, queryClient, resetPlayback, status.data?.rewardCardHours]
  )

  const handleClose = useCallback(async () => {
    if (claimStateRef.current === 'pending' || abandon.isPending) return
    const activeWatch = watchRef.current
    if (activeWatch && claimStateRef.current !== 'succeeded') {
      await abandonWatch(activeWatch, null)
      return
    }
    setOpened(false)
    resetPlayback()
  }, [abandon.isPending, abandonWatch, resetPlayback])

  const handlePlay = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget
      if (document.hidden) {
        video.pause()
        setPlaybackNotice('页面不可见时不能累计观看时长。')
        return
      }
      if (video.playbackRate !== 1) video.playbackRate = 1
      setPlaybackNotice(null)
      setIsPlaying(true)
      beginSegment(video)
    },
    [beginSegment]
  )

  const handlePause = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      settleSegment(event.currentTarget)
      setIsPlaying(false)
    },
    [settleSegment]
  )

  const handleBuffering = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      settleSegment(event.currentTarget)
      setIsPlaying(false)
      setPlaybackNotice('广告正在缓冲，缓冲期间不会累计观看时长。')
    },
    [settleSegment]
  )

  const reportServerProgress = useCallback(
    (mediaTime: number): Promise<boolean> => {
      serverProgressTargetRef.current = Math.max(
        serverProgressTargetRef.current,
        Math.min(assetDurationSeconds, Math.floor(mediaTime))
      )
      if (progressInFlightRef.current) return progressInFlightRef.current
      const activeWatch = watchRef.current
      if (!activeWatch || !progressTokenRef.current) return Promise.resolve(false)

      const request = (async () => {
        let reported = false
        while (serverProgressPositionRef.current < serverProgressTargetRef.current) {
          const nextPosition = serverProgressPositionRef.current + 1
          const nextSequence = serverProgressSequenceRef.current + 1
          try {
            const receipt = await progress.mutateAsync({
              watchId: activeWatch.watchId,
              progressToken: progressTokenRef.current,
              mediaPositionSeconds: nextPosition,
              sequence: nextSequence,
              focused: !document.hidden,
            })
            if (receipt.mediaPositionSeconds !== nextPosition || receipt.sequence !== nextSequence) {
              throw new Error('服务端返回了不匹配的播放进度')
            }
            serverProgressPositionRef.current = receipt.mediaPositionSeconds
            serverProgressSequenceRef.current = receipt.sequence
            progressTokenRef.current = receipt.nextProgressToken
            reported = true
          } catch (error) {
            if (isElapsedProgressWindow(error) && watchRef.current?.watchId === activeWatch.watchId) {
              const video = videoRef.current
              if (video) {
                settleSegment(video)
                video.pause()
              }
              setIsPlaying(false)
              await abandonWatch(activeWatch, '观看中断超过 5 秒，本次未发放奖励，请重新开始。')
              return false
            }
            setClaimError(`播放进度回执失败：${errorMessage(error)}`)
            return false
          }
        }
        return reported
      })().finally(() => {
        progressInFlightRef.current = null
      })
      progressInFlightRef.current = request
      return request
    },
    [abandonWatch, assetDurationSeconds, progress, settleSegment]
  )

  const handleTimeUpdate = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget
      const segment = segmentRef.current
      if (!segment) return
      const wallTime = monotonicNow()
      const wallSeconds = Math.max(0, wallTime - segment.wallStartedAt) / 1000
      const maximumPlausibleTime = segment.mediaStartedAt + wallSeconds + MEDIA_LEAD_TOLERANCE_SECONDS
      if (video.currentTime > maximumPlausibleTime) {
        stopInvalidPlayback(video, '检测到快进，快进部分不会计入有效时长，请继续正常播放。')
        return
      }
      segment.trustedMediaTime = video.currentTime
      trustedMediaTimeRef.current = video.currentTime
      publishProgress(creditedMillisecondsRef.current + segmentProgress(segment, video.currentTime, wallTime))
      void reportServerProgress(video.currentTime)
    },
    [publishProgress, reportServerProgress, segmentProgress, stopInvalidPlayback]
  )

  const handleSeeking = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget
      const correctionTarget = correctionTargetRef.current
      if (correctionTarget !== null) {
        correctionTargetRef.current = null
        if (Math.abs(video.currentTime - correctionTarget) <= 0.05) return
      }
      const segment = segmentRef.current
      if (video.currentTime > trustedMediaTimeRef.current + MEDIA_LEAD_TOLERANCE_SECONDS) {
        stopInvalidPlayback(video, '奖励广告不支持快进，请按正常速度完整观看。')
        return
      }
      if (!segment) {
        trustedMediaTimeRef.current = video.currentTime
        return
      }
      resumeAfterSeekRef.current = true
      settleSegment(video, segment.trustedMediaTime)
    },
    [settleSegment, stopInvalidPlayback]
  )

  const handleSeeked = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      if (!resumeAfterSeekRef.current) return
      resumeAfterSeekRef.current = false
      trustedMediaTimeRef.current = event.currentTarget.currentTime
      beginSegment(event.currentTarget)
    },
    [beginSegment]
  )

  const handleRateChange = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget
      if (video.playbackRate === 1) return
      video.playbackRate = 1
      stopInvalidPlayback(video, '奖励广告不支持倍速播放，已暂停并恢复为正常速度。')
    },
    [stopInvalidPlayback]
  )

  const attemptCompletionAndClaim = useCallback(
    async (video: HTMLVideoElement | null = videoRef.current) => {
      const activeWatch = watchRef.current
      if (!activeWatch || !endedRef.current) return
      if (video) await reportServerProgress(video.currentTime)
      if (
        effectiveMillisecondsRef.current < requiredMilliseconds ||
        serverProgressPositionRef.current < assetDurationSeconds
      ) {
        eligibleRef.current = false
        autoClaimAttemptedRef.current = false
        setPlaybackNotice('服务端尚未确认完整播放，本次不能领取奖励。')
        return
      }
      setClaimError(null)
      try {
        const receipt = await complete.mutateAsync({
          watchId: activeWatch.watchId,
          progressToken: progressTokenRef.current,
        })
        if (receipt.watchId !== activeWatch.watchId) {
          throw new Error('服务端返回了不匹配的播放完成回执')
        }
        eligibleRef.current = true
        setPlaybackNotice(null)
        if (!completionTrackedRef.current) {
          completionTrackedRef.current = true
          trackRewardedAd('rewarded_ad_complete', activeWatch, status.data?.rewardCardHours ?? 0)
        }
        await attemptClaim()
      } catch (error) {
        eligibleRef.current = false
        autoClaimAttemptedRef.current = false
        setClaimError(`完整播放确认失败：${errorMessage(error)}`)
      }
    },
    [assetDurationSeconds, attemptClaim, complete, reportServerProgress, requiredMilliseconds, status.data]
  )

  const handleEnded = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      settleSegment(event.currentTarget)
      endedRef.current = true
      setHasEnded(true)
      setIsPlaying(false)
      if (!autoClaimAttemptedRef.current) {
        autoClaimAttemptedRef.current = true
        void attemptCompletionAndClaim(event.currentTarget)
      }
    },
    [attemptCompletionAndClaim, settleSegment]
  )

  const handleVideoError = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget
      settleSegment(video)
      video.pause()
      setIsPlaying(false)
      setVideoError('广告视频尚未部署、网络异常或格式无法播放，请稍后重试。')
    },
    [settleSegment]
  )

  const retryVideoLoad = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setVideoError(null)
    setPlaybackNotice(null)
    video.load()
  }, [])

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current
    if (!video || hasEnded || watchExpired || videoError) return
    if (isPlaying) {
      video.pause()
      return
    }
    try {
      video.playbackRate = 1
      await video.play()
    } catch (error) {
      setPlaybackNotice(`视频无法播放：${errorMessage(error)}`)
    }
  }, [hasEnded, isPlaying, videoError, watchExpired])

  useEffect(() => {
    if (!opened) return
    const timer = window.setInterval(() => {
      const video = videoRef.current
      const segment = segmentRef.current
      if (video && segment) {
        publishProgress(creditedMillisecondsRef.current + segmentProgress(segment, video.currentTime, monotonicNow()))
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [opened, publishProgress, segmentProgress])

  useEffect(() => {
    if (!opened) return
    const pauseForInterruption = (message: string) => {
      const video = videoRef.current
      if (video) {
        settleSegment(video)
        video.pause()
      }
      setIsPlaying(false)
      setPlaybackNotice(message)
    }
    const onVisibilityChange = () => {
      if (!document.hidden) return
      pauseForInterruption('页面切到后台时广告已暂停，后台时长不会计入奖励。')
    }
    const onWindowBlur = () => pauseForInterruption('窗口失去焦点时广告已暂停，离开期间不会累计时长。')
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [opened, settleSegment])

  useEffect(() => {
    if (!opened || !watchExpired || claimResult) return
    const video = videoRef.current
    if (video) {
      settleSegment(video)
      video.pause()
    }
    setIsPlaying(false)
    setPlaybackNotice('本次广告已过期，请关闭后重新观看。')
  }, [claimResult, opened, settleSegment, watchExpired])

  const available = Boolean(status.data?.eligible && status.data.remainingCount > 0)
  const reward = status.data?.rewardCardHours
  const qualifiedAccount = account.data && 'spendableCardHours' in account.data ? account.data : null
  const progressPercent = Math.min(100, (validMilliseconds / requiredMilliseconds) * 100)
  const watchedSeconds = Math.min(requiredSeconds, Math.floor(validMilliseconds / 1000))
  const statusUnsupported = status.error instanceof WalletApiError && status.error.kind === 'unsupported'

  let actionLabel = reward ? '观看并领取' : '观看广告赚卡时'
  if (status.isPending && !status.data) actionLabel = '正在查询奖励…'
  else if (status.data && !status.data.eligible) actionLabel = '今日奖励已领取'

  return (
    <>
      <Card withBorder component="section" aria-labelledby={titleId}>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={2}>
              <Group gap="xs">
                <Title order={4} id={titleId}>
                  看广告得卡时
                </Title>
                <Badge size="xs" variant="light" color="gray">
                  广告 · AD
                </Badge>
              </Group>
              <Text size="sm" c="kod-tertiary" id={descriptionId}>
                完整观看 {status.data?.minimumSeconds ?? MINIMUM_REWARDED_WATCH_SECONDS} 秒广告后领取奖励。
              </Text>
            </Stack>
            <IconGift size={24} aria-hidden="true" />
          </Group>

          {status.isPending && !status.data && <Loader size="sm" aria-label="正在加载广告奖励" />}
          {status.error && !status.data && (
            <Alert
              color={statusUnsupported ? 'yellow' : 'red'}
              title={statusUnsupported ? '服务端尚未开通' : '奖励信息加载失败'}
            >
              <Stack gap="xs">
                <Text size="sm">{errorMessage(status.error)}</Text>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconRefresh size={14} />}
                  onClick={() => void status.refetch()}
                >
                  重试
                </Button>
              </Stack>
            </Alert>
          )}
          {status.error && status.data && (
            <Text size="xs" c="orange" role="status">
              奖励信息刷新失败，当前显示上次结果。
            </Text>
          )}
          {status.data && (
            <Stack gap="xs">
              <Stack gap={0}>
                <Text fw={700} c="blue">
                  +{formatCardTime(status.data.rewardCardHours)}
                </Text>
                <Text size="xs" c="kod-tertiary" aria-live="polite">
                  {status.data.eligible
                    ? `今日可领取 ${status.data.remainingCount} 次`
                    : `下次可领取日期：${status.data.nextEligibleDate}`}
                </Text>
              </Stack>
              <Button
                fullWidth
                variant="light"
                leftSection={<IconPlayerPlay size={16} />}
                disabled={!available || start.isPending}
                loading={start.isPending}
                aria-describedby={descriptionId}
                onClick={() => void handleStart()}
              >
                {actionLabel}
              </Button>
            </Stack>
          )}
          {start.error && (
            <Text size="sm" c="red" role="alert">
              无法开始广告：{errorMessage(start.error)}
            </Text>
          )}
          {recoveryNotice && (
            <Alert color="yellow" role="status">
              {recoveryNotice}
            </Alert>
          )}
          {qualifiedAccount && (
            <Stack gap={4}>
              <Group justify="space-between">
                <Text size="xs" c="kod-tertiary">
                  可消费卡时
                </Text>
                <Text size="xs" fw={600}>
                  {formatCardTime(qualifiedAccount.spendableCardHours)}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="kod-tertiary">
                  可回购卡时
                </Text>
                <Text size="xs" fw={600}>
                  {formatCardTime(qualifiedAccount.redeemableCardHours)}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="kod-tertiary">
                  奖励卡时
                </Text>
                <Text size="xs" fw={600}>
                  {formatCardTime(qualifiedAccount.rewardCardHours)}
                </Text>
              </Group>
              <Text size="xs" c="kod-tertiary">
                奖励卡时仅限平台使用，不可回购成人民币
              </Text>
            </Stack>
          )}
        </Stack>
      </Card>

      <AdaptiveModal
        opened={opened}
        onClose={() => void handleClose()}
        title="观看广告得卡时"
        centered
        size="lg"
        closeOnClickOutside={false}
        closeOnEscape={claimStateRef.current !== 'pending'}
      >
        <Stack gap="md">
          <Group justify="space-between">
            <Badge variant="light" color="gray">
              广告 · AD
            </Badge>
            {reward != null && (
              <Text size="sm" fw={600} c="blue">
                完整观看可得 +{formatCardTime(reward)}
              </Text>
            )}
          </Group>

          {claimResult ? (
            <Alert color="green" icon={<IconCheck size={18} />} title="领取成功">
              <Stack gap="xs">
                <Text>{formatCardTime(claimResult.rewardCardHours)}已到账</Text>
                <Text size="sm">奖励卡时仅限平台使用，不可回购成人民币</Text>
              </Stack>
            </Alert>
          ) : (
            <>
              <Group justify="center">
                <Box
                  className="overflow-hidden rounded-lg bg-black"
                  style={{
                    aspectRatio: '9 / 16',
                    height: 'min(65dvh, 640px)',
                    maxHeight: 'min(65dvh, 640px)',
                    maxWidth: '100%',
                  }}
                  aria-describedby={watchHelpId}
                >
                  <video
                    ref={videoRef}
                    src={videoSource?.videoUrl}
                    poster={videoSource?.posterUrl}
                    preload="metadata"
                    playsInline
                    disablePictureInPicture
                    controls={false}
                    aria-label="奖励广告视频"
                    className="block h-full w-full object-contain"
                    onPlay={handlePlay}
                    onPlaying={handlePlay}
                    onPause={handlePause}
                    onWaiting={handleBuffering}
                    onTimeUpdate={handleTimeUpdate}
                    onSeeking={handleSeeking}
                    onSeeked={handleSeeked}
                    onRateChange={handleRateChange}
                    onEnded={handleEnded}
                    onError={handleVideoError}
                    onLoadedData={() => setVideoError(null)}
                    onContextMenu={(event) => event.preventDefault()}
                  />
                </Box>
              </Group>

              <Stack gap={4}>
                <Progress value={progressPercent} aria-label={`有效观看进度 ${watchedSeconds}/${requiredSeconds} 秒`} />
                <Group justify="space-between">
                  <Text size="xs" c="kod-tertiary" aria-live="polite">
                    有效观看 {watchedSeconds}/{requiredSeconds} 秒
                  </Text>
                  <Text size="xs" c="kod-tertiary">
                    正常速度 · 不可快进
                  </Text>
                </Group>
              </Stack>

              <Text id={watchHelpId} size="xs" c="kod-tertiary">
                需保持页面可见并以正常速度完整播放；切到后台会自动暂停，关闭弹窗将放弃本次观看。
              </Text>
              {playbackNotice && (
                <Alert color={hasEnded && !eligibleRef.current ? 'red' : 'yellow'} role="status">
                  {playbackNotice}
                </Alert>
              )}
              {videoError && (
                <Alert color="red" title="视频加载失败" role="alert">
                  <Stack gap="xs">
                    <Text size="sm">{videoError}</Text>
                    <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} onClick={retryVideoLoad}>
                      重试加载
                    </Button>
                  </Stack>
                </Alert>
              )}
              {claimError && (
                <Alert color="red" title="奖励领取失败" role="alert">
                  {claimError}
                </Alert>
              )}
            </>
          )}

          <AdaptiveModal.Actions>
            {claimResult ? (
              <Button leftSection={<IconCheck size={16} />} onClick={handleClose}>
                完成
              </Button>
            ) : (
              <AdaptiveModal.CloseButton
                disabled={claim.isPending || abandon.isPending}
                onClick={() => void handleClose()}
              >
                关闭并放弃
              </AdaptiveModal.CloseButton>
            )}
            {!claimResult && !hasEnded && !videoError && (
              <Button
                leftSection={isPlaying ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                disabled={watchExpired}
                onClick={() => void togglePlayback()}
              >
                {isPlaying ? '暂停' : '开始播放'}
              </Button>
            )}
            {!claimResult && hasEnded && (
              <Button
                loading={claim.isPending || complete.isPending}
                disabled={claim.isPending || complete.isPending}
                onClick={() => void (eligibleRef.current ? attemptClaim() : attemptCompletionAndClaim())}
              >
                {claim.isPending || complete.isPending ? '正在领取…' : claimError ? '重试领取' : '领取奖励'}
              </Button>
            )}
          </AdaptiveModal.Actions>
        </Stack>
      </AdaptiveModal>
    </>
  )
}

export default RewardedVideoCard
