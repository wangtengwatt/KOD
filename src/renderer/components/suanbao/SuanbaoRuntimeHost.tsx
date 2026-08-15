import type {
  SuanbaoBootstrap,
  SuanbaoHostRequest,
  SuanbaoPetState,
  SuanbaoPlatformCapabilities,
  SuanbaoViewModel,
} from '@shared/types/suanbao'
import { useLocation } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getLogger } from '@/lib/utils'
import { suanbaoRuntime } from '@/packages/suanbao/runtime'
// 副作用导入：激活 §10.5 V1 偏好一次性迁移到 Settings.suanbao（hydration 后触发，读路径不变）
import '@/packages/suanbao/suanbaoSettingsSync'
import platform from '@/platform'
import { router } from '@/router'
import { currentSessionIdAtom } from '@/stores/atoms/sessionAtoms'
import { useSession } from '@/stores/chatStore'
import { useLanguage } from '@/stores/settingsStore'
import { useCurrentTaskId, useTaskSessionRecord } from '@/stores/taskSessionStore'
import { SuanbaoDesktopBridgeHost } from './SuanbaoDesktopBridgeHost'
import { continueRecentChat, openSuanbaoSettings, startNewChat, startSuanbaoMessage } from './suanbaoActions'
import { mapMessagesToSuanbaoState } from './suanbaoState'
import { useSuanbaoStore } from './suanbaoStore'

const IN_APP_CAPABILITIES: SuanbaoPlatformCapabilities = {
  overlay: 'in-app',
  notifications: false,
  backgroundScheduling: 'foreground-only',
  geolocation: typeof navigator !== 'undefined' && 'geolocation' in navigator,
  systemCalendarRead: false,
}

const log = getLogger('suanbao-runtime-host')
const SUANBAO_SYNC_RETRY_DELAYS_MS = [0, 250, 750]

async function waitForRetry(delayMs: number): Promise<void> {
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
}

const STATUS_COPY: Record<SuanbaoPetState, string> = {
  idle: '蒜宝已就绪',
  listening: '我在听',
  thinking: '蒜宝正在思考',
  executing: '蒜宝正在执行工具',
  success: '任务完成',
  error: '处理时遇到问题',
  reminding: '你有一条提醒',
  focus: '专注中',
  rest: '休息一下吧',
  sleeping: '蒜宝正在休息',
  peeking: '蒜宝正在探头',
  hiding: '蒜宝已暂时隐藏',
}

const resolvePetState = (
  chatState: SuanbaoPetState,
  runtimeSnapshot: ReturnType<typeof suanbaoRuntime.getSnapshot>
): SuanbaoPetState => {
  const operation = runtimeSnapshot.operation
  if (operation?.phase === 'failed') return 'error'
  if (operation?.phase === 'running') return 'executing'
  if (operation?.kind === 'reminder-delivery') return 'reminding'
  if (operation?.phase === 'succeeded') return 'success'
  if (runtimeSnapshot.activePomodoro) {
    return runtimeSnapshot.activePomodoro.phase === 'work' ? 'focus' : 'rest'
  }
  return chatState
}

/** Keeps the isolated Electron window synchronized with the main renderer business state. */
export function SuanbaoRuntimeHost() {
  const location = useLocation()
  const enabled = useSuanbaoStore((state) => state.enabled)
  const hidden = useSuanbaoStore((state) => state.hidden)
  const animation = useSuanbaoStore((state) => state.animation)
  const accountKey = useSuanbaoStore((state) => state.accountKey)
  const language = useLanguage()
  const runtimeSnapshot = useSyncExternalStore(
    suanbaoRuntime.subscribe.bind(suanbaoRuntime),
    suanbaoRuntime.getSnapshot
  )
  const persistedSessionId = useAtomValue(currentSessionIdAtom)
  const routeSessionId = location.pathname.startsWith('/session/') ? location.pathname.slice('/session/'.length) : null
  const chatSessionId = routeSessionId || persistedSessionId
  const currentTaskId = useCurrentTaskId()
  const routeTaskId = location.pathname.startsWith('/task/') ? location.pathname.slice('/task/'.length) : null
  const taskId = routeTaskId || currentTaskId
  const { session } = useSession(chatSessionId)
  const { data: taskSession } = useTaskSessionRecord(taskId)
  const messages = location.pathname.startsWith('/task') ? taskSession?.messages : session?.messages
  const chatPetState = mapMessagesToSuanbaoState(messages)
  const petState = resolvePetState(chatPetState, runtimeSnapshot)
  const [bubbleOpen, setBubbleOpen] = useState(false)
  const [capabilities, setCapabilities] = useState<SuanbaoPlatformCapabilities>(IN_APP_CAPABILITIES)

  useEffect(() => {
    const handleError = () => undefined
    void suanbaoRuntime.switchAccount(accountKey).catch(handleError)
    const reconcile = () => void suanbaoRuntime.reconcile().catch(handleError)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') reconcile()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    const cancelFocus = platform.onWindowFocused(reconcile)
    const cancelShow = platform.onWindowShow(reconcile)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      cancelFocus()
      cancelShow()
    }
  }, [accountKey])

  useEffect(() => {
    let active = true
    const controller = platform.getSuanbaoController()
    // The main process decides whether the desktop window or in-app pet is visible.
    void (async () => {
      for (const delayMs of SUANBAO_SYNC_RETRY_DELAYS_MS) {
        await waitForRetry(delayMs)
        if (!active) return
        try {
          const next = await controller.getCapabilities()
          if (active) setCapabilities(next)
          return
        } catch (error) {
          log.warn('Failed to read Suanbao platform capabilities; retrying.', error)
        }
      }
      log.error('Suanbao platform capabilities are unavailable after retries.')
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const controller = platform.getSuanbaoController()
    void (async () => {
      for (const delayMs of SUANBAO_SYNC_RETRY_DELAYS_MS) {
        await waitForRetry(delayMs)
        if (!active) return
        try {
          await controller.setEnabled(enabled)
          if (!enabled || hidden) await controller.hide()
          // show() synchronizes visibility and only floats while the main window is hidden.
          else await controller.show()
          return
        } catch (error) {
          log.warn('Failed to synchronize the Suanbao desktop window; retrying.', error)
        }
      }
      log.error('Suanbao desktop window synchronization failed after retries.')
    })()
    return () => {
      active = false
    }
  }, [enabled, hidden])

  const viewModel = useMemo<SuanbaoViewModel>(() => {
    const updatedAt = Date.now()
    return {
      revision: updatedAt,
      petState,
      bubbleOpen,
      message: runtimeSnapshot.operation?.message || STATUS_COPY[petState],
      operationId: runtimeSnapshot.operation?.operationId,
      operation: runtimeSnapshot.operation,
      connection: runtimeSnapshot.initialized ? 'online' : runtimeSnapshot.errorCode ? 'offline' : 'connecting',
      updatedAt,
    }
  }, [bubbleOpen, petState, runtimeSnapshot])

  const bootstrap = useMemo<SuanbaoBootstrap>(
    () => ({
      enabled,
      visible: enabled && !hidden,
      language: language === 'en' ? 'en' : 'zh-Hans',
      animation,
      placement: {
        mode: capabilities.overlay === 'desktop-window' ? 'desktop' : 'in-app',
        x: 0,
        y: 0,
        anchor: 'bottom-right',
        locked: false,
      },
      capabilities,
      viewModel,
    }),
    [animation, capabilities, enabled, hidden, language, viewModel]
  )

  const onCommand = useCallback((request: SuanbaoHostRequest) => {
    if (request.kind === 'confirm-operation') {
      void suanbaoRuntime.confirm(request.operationId).catch(() => undefined)
      return
    }
    if (request.kind === 'cancel-operation') {
      void suanbaoRuntime.cancel(request.operationId).catch(() => undefined)
      return
    }

    const command = request.command
    if (command.type === 'open-bubble') {
      setBubbleOpen(true)
      return
    }
    if (command.type === 'close-bubble') {
      setBubbleOpen(false)
      return
    }
    if (command.type === 'send-message') {
      void startSuanbaoMessage(command.input)
      return
    }
    if (command.route === 'new-chat') {
      void startNewChat()
    } else if (command.route === 'recent-chat') {
      void continueRecentChat()
    } else if (command.route === 'suanbao-settings') {
      openSuanbaoSettings()
    } else if (command.route === 'image-creator') {
      void router.navigate({ to: '/image-creator' })
    } else if (command.route === 'task-home') {
      void router.navigate({ to: '/task' })
    }
  }, [])

  return (
    <SuanbaoDesktopBridgeHost
      bootstrap={bootstrap}
      viewModel={viewModel}
      onCommand={onCommand}
      onIntegrationError={(error) => log.error('Suanbao desktop bridge failed.', error)}
    />
  )
}
