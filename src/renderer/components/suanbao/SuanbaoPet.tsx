import { Button, Popover, Stack, Text, Textarea, UnstyledButton } from '@mantine/core'
import type { SuanbaoConfirmation } from '@shared/types/suanbao'
import { IconEyeOff, IconMessagePlus, IconPlayerStop, IconSettings, IconSparkles } from '@tabler/icons-react'
import { useLocation } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { suanbaoConversationService } from '@/packages/suanbao/conversation'
import { parseLocalSuanbaoIntent } from '@/packages/suanbao/intent'
import { getSuanbaoAssistantService, prepareSuanbaoConfirmation } from '@/packages/suanbao/runtime'
import { router } from '@/router'
import { currentSessionIdAtom } from '@/stores/atoms/sessionAtoms'
import { useSession } from '@/stores/chatStore'
import { useCurrentTaskId, useTaskSessionRecord } from '@/stores/taskSessionStore'
import { SuanbaoMascot } from './SuanbaoMascot'
import {
  cancelSuanbaoAction,
  continueRecentChat,
  openSuanbaoSettings,
  type SuanbaoPromptKind,
  startNewChat,
} from './suanbaoActions'
import { trackSuanbaoAction } from './suanbaoAnalytics'
import { buildSuanbaoPrompt } from './suanbaoPrompts'
import { isSuanbaoBusyState, mapMessagesToSuanbaoState } from './suanbaoState'
import { useSuanbaoStore } from './suanbaoStore'
import { normalizedToPixels, pixelsToNormalized, shouldShowSuanbao } from './suanbaoUtils'
import './suanbao.css'

const NullFallback = () => null

function SuanbaoPetInner() {
  const { t } = useTranslation()
  const location = useLocation()
  const settingsOpen = Boolean((location.search as { settings?: string }).settings)
  const enabled = useSuanbaoStore((state) => state.enabled)
  const hidden = useSuanbaoStore((state) => state.hidden)
  const animation = useSuanbaoStore((state) => state.animation)
  const position = useSuanbaoStore((state) => state.position)
  const locked = useSuanbaoStore((state) => state.locked)
  const setPreferences = useSuanbaoStore((state) => state.setPreferences)
  const persistedSessionId = useAtomValue(currentSessionIdAtom)
  const routeSessionId = location.pathname.startsWith('/session/') ? location.pathname.slice('/session/'.length) : null
  const chatSessionId = routeSessionId || persistedSessionId
  const currentTaskId = useCurrentTaskId()
  const routeTaskId = location.pathname.startsWith('/task/') ? location.pathname.slice('/task/'.length) : null
  const taskId = routeTaskId || currentTaskId
  const { session } = useSession(chatSessionId)
  const { data: taskSession } = useTaskSessionRecord(taskId)
  const routeState = mapMessagesToSuanbaoState(
    location.pathname.startsWith('/task') ? taskSession?.messages : session?.messages
  )
  const busy = isSuanbaoBusyState(routeState)
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    dx: number
    dy: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousStateRef = useRef(routeState)
  const terminalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [visualState, setVisualState] = useState(routeState)
  const pixelPositionRef = useRef({ x: 12, y: 12 })
  const [pixelPosition, setPixelPosition] = useState({ x: 12, y: 12 })
  const [positionReady, setPositionReady] = useState(false)
  const [opened, setOpened] = useState(false)
  const [promptKind, setPromptKind] = useState<SuanbaoPromptKind | null>(null)
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [reply, setReply] = useState('')
  const [confirmation, setConfirmation] = useState<SuanbaoConfirmation | null>(null)
  const [operationId, setOperationId] = useState<string | null>(null)

  useEffect(() => {
    const measure = () => {
      const next = normalizedToPixels(position, {
        width: window.innerWidth,
        height: window.innerHeight,
        petWidth: rootRef.current?.offsetWidth ?? 94,
        petHeight: rootRef.current?.offsetHeight ?? 116,
      })
      pixelPositionRef.current = next
      setPixelPosition(next)
      setPositionReady(true)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [position])

  useEffect(() => {
    if (terminalTimerRef.current) clearTimeout(terminalTimerRef.current)
    const wasBusy = isSuanbaoBusyState(previousStateRef.current)
    if (wasBusy && (routeState === 'success' || routeState === 'error')) {
      setVisualState(routeState)
      terminalTimerRef.current = setTimeout(() => setVisualState('idle'), 1800)
    } else {
      setVisualState(routeState === 'success' || routeState === 'error' ? 'idle' : routeState)
    }
    previousStateRef.current = routeState
    return () => {
      if (terminalTimerRef.current) clearTimeout(terminalTimerRef.current)
    }
  }, [routeState])

  useEffect(
    () => () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    },
    []
  )

  if (!enabled || hidden || !shouldShowSuanbao(location.pathname, settingsOpen)) return null

  const bounds = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
    petWidth: rootRef.current?.offsetWidth ?? 94,
    petHeight: rootRef.current?.offsetHeight ?? 116,
  })

  const cleanupPointer = (event: ReactPointerEvent<HTMLDivElement>, persistPosition: boolean) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (persistPosition) setPreferences({ position: pixelsToNormalized(pixelPositionRef.current, bounds()) })
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      locked ||
      event.button !== 0 ||
      (event.target !== event.currentTarget && !(event.target as Element).closest('.suanbao-mascot, .suanbao-name'))
    )
      return
    dragRef.current = {
      pointerId: event.pointerId,
      dx: event.clientX - pixelPosition.x,
      dy: event.clientY - pixelPosition.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3
    const next = normalizedToPixels(
      pixelsToNormalized({ x: event.clientX - drag.dx, y: event.clientY - drag.dy }, bounds()),
      bounds()
    )
    pixelPositionRef.current = next
    setPixelPosition(next)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    cleanupPointer(event, true)
    if (!drag.moved) {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        setOpened((value) => !value)
      }, 220)
    }
  }

  const openFullChat = () => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = null
    setOpened(false)
    trackSuanbaoAction('open_chat')
    void continueRecentChat()
  }

  const navigateFromSuanbao = async (route: string) => {
    if (route === 'image-creator') await router.navigate({ to: '/image-creator' })
    else if (route === 'task-home') await router.navigate({ to: '/task' })
    else if (route === 'suanbao-settings') openSuanbaoSettings()
    else if (route === 'new-chat') await startNewChat()
  }

  const runPrompt = async () => {
    if (submitting || busy || !input.trim()) return
    const text = input.trim()
    try {
      setSubmitting(true)
      setError('')
      setReply('')
      setConfirmation(null)
      const localIntent = parseLocalSuanbaoIntent(text)
      if (localIntent?.type === 'navigate') {
        await navigateFromSuanbao(localIntent.route)
        setOpened(false)
      } else if (localIntent?.type === 'set-visibility') {
        setPreferences({ hidden: localIntent.hidden })
      } else if (localIntent?.type === 'set-locked') {
        setPreferences({ locked: localIntent.locked })
        setReply(String(localIntent.locked ? t('Suanbao position locked') : t('Suanbao position unlocked')))
      } else if (localIntent?.type === 'offline-reply') {
        setReply(localIntent.text)
      } else if (localIntent?.type === 'confirmation') {
        await prepareSuanbaoConfirmation(localIntent.confirmation)
        setConfirmation(localIntent.confirmation)
      } else if (promptKind) {
        trackSuanbaoAction(promptKind === 'explain-code' ? 'explain_code' : 'analyze_error')
        const result = await suanbaoConversationService.send(buildSuanbaoPrompt(promptKind, text))
        setOperationId(result.operationId)
        setReply(result.text)
      } else {
        const result = await suanbaoConversationService.send(text)
        setOperationId(result.operationId)
        setReply(result.text)
      }
      setInput('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="top-end" width={300} shadow="xl" withArrow>
      <Popover.Target>
        <div
          ref={rootRef}
          className="suanbao-root"
          style={{
            transform: `translate3d(${pixelPosition.x}px, ${pixelPosition.y}px, 0)`,
            visibility: positionReady ? 'visible' : 'hidden',
            cursor: locked ? 'pointer' : undefined,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(event) => cleanupPointer(event, false)}
          onLostPointerCapture={() => {
            dragRef.current = null
          }}
          onDoubleClick={openFullChat}
          role="button"
          tabIndex={0}
          aria-label={`${t('Open Suanbao assistant') || 'Open Suanbao assistant'}: ${visualState}`}
          aria-live="polite"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') setOpened((value) => !value)
          }}
        >
          <SuanbaoMascot animation={animation} state={visualState} />
          <span className="suanbao-name">{t('Suanbao')}</span>
        </div>
      </Popover.Target>
      <Popover.Dropdown className="suanbao-menu" onPointerDown={(event) => event.stopPropagation()}>
        <Stack gap="xs">
          <div>
            <Text fw={700}>{t('Suanbao')}</Text>
            <Text size="xs" c="dimmed">
              {t('Your quick coding companion')}
            </Text>
          </div>
          {confirmation ? (
            <Stack gap="xs">
              <Text fw={600}>{confirmation.title}</Text>
              {confirmation.fields.map((field) => (
                <Text key={field.label} size="sm">
                  {field.label}: {field.value}
                </Text>
              ))}
              <Text size="xs" c="dimmed">
                {t('Confirm before Suanbao performs this action.')}
              </Text>
              <div className="flex gap-2">
                <Button
                  variant="subtle"
                  disabled={submitting}
                  onClick={() => {
                    setSubmitting(true)
                    void getSuanbaoAssistantService()
                      .cancelConfirmation(confirmation.operationId)
                      .then(() => setConfirmation(null))
                      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
                      .finally(() => setSubmitting(false))
                  }}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  loading={submitting}
                  onClick={() => {
                    setSubmitting(true)
                    setError('')
                    void getSuanbaoAssistantService()
                      .confirm(confirmation.operationId)
                      .then((result) => {
                        setReply(result.message)
                        setConfirmation(null)
                      })
                      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
                      .finally(() => setSubmitting(false))
                  }}
                >
                  {t('Confirm')}
                </Button>
              </div>
            </Stack>
          ) : promptKind ? (
            <>
              <Textarea
                autoFocus
                autosize
                minRows={4}
                maxRows={8}
                value={input}
                onChange={(event) => setInput(event.currentTarget.value)}
                placeholder={
                  t(promptKind === 'explain-code' ? 'Paste code to explain…' : 'Paste an error message…') || undefined
                }
              />
              {reply && <Text size="sm">{reply}</Text>}
              {error && (
                <Text size="xs" c="red">
                  {error}
                </Text>
              )}
              <div className="flex gap-2">
                <Button
                  variant="subtle"
                  onClick={() => {
                    setPromptKind(null)
                    setReply('')
                    setError('')
                  }}
                >
                  {t('Back')}
                </Button>
                <Button loading={submitting} disabled={!input.trim() || busy} onClick={runPrompt}>
                  {t('Send')}
                </Button>
              </div>
            </>
          ) : (
            <>
              {reply && <Text size="sm">{reply}</Text>}
              {error && (
                <Text size="xs" c="red">
                  {error}
                </Text>
              )}
              <Textarea
                autosize
                minRows={2}
                maxRows={5}
                value={input}
                onChange={(event) => setInput(event.currentTarget.value)}
                placeholder={t('Talk to Suanbao…') || undefined}
              />
              <div className="flex gap-2">
                <Button loading={submitting} disabled={!input.trim()} onClick={runPrompt}>
                  {t('Send')}
                </Button>
                {operationId && submitting && (
                  <Button
                    variant="subtle"
                    onClick={() => {
                      suanbaoConversationService.cancel(operationId)
                      setOperationId(null)
                    }}
                  >
                    {t('Cancel')}
                  </Button>
                )}
              </div>
              <UnstyledButton
                className="suanbao-menu-item"
                disabled={submitting || busy}
                onClick={() => setPromptKind('explain-code')}
              >
                <IconSparkles size={18} /> {t('Explain code')}
              </UnstyledButton>
              <UnstyledButton
                className="suanbao-menu-item"
                disabled={submitting || busy}
                onClick={() => setPromptKind('analyze-error')}
              >
                <IconSparkles size={18} /> {t('Analyze error')}
              </UnstyledButton>
              <UnstyledButton
                className="suanbao-menu-item"
                onClick={() => {
                  trackSuanbaoAction('continue_recent')
                  void continueRecentChat()
                  setOpened(false)
                }}
              >
                <IconMessagePlus size={18} /> {t('Continue recent')}
              </UnstyledButton>
              <UnstyledButton
                className="suanbao-menu-item"
                disabled={submitting || busy}
                onClick={() => {
                  trackSuanbaoAction('new_chat')
                  void startNewChat()
                  setOpened(false)
                }}
              >
                <IconMessagePlus size={18} /> {t('New chat')}
              </UnstyledButton>
              {busy && (
                <UnstyledButton
                  className="suanbao-menu-item suanbao-danger"
                  onClick={() => {
                    trackSuanbaoAction('cancel')
                    void cancelSuanbaoAction({ pathname: location.pathname, chatSessionId })
                  }}
                >
                  <IconPlayerStop size={18} /> {t('Cancel active generation')}
                </UnstyledButton>
              )}
              <UnstyledButton
                className="suanbao-menu-item"
                onClick={() => {
                  setPreferences({ hidden: true })
                  trackSuanbaoAction('hide')
                }}
              >
                <IconEyeOff size={18} /> {t('Hide Suanbao')}
              </UnstyledButton>
              <UnstyledButton
                className="suanbao-menu-item"
                onClick={() => {
                  trackSuanbaoAction('settings')
                  void router.navigate({ to: '/settings/suanbao' })
                  setOpened(false)
                }}
              >
                <IconSettings size={18} /> 任务与日程
              </UnstyledButton>
              <UnstyledButton
                className="suanbao-menu-item"
                onClick={() => {
                  trackSuanbaoAction('settings')
                  openSuanbaoSettings()
                }}
              >
                <IconSettings size={18} /> {t('Settings')}
              </UnstyledButton>
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

export default function SuanbaoPet() {
  return (
    <ErrorBoundary name="suanbao-pet" fallback={NullFallback}>
      <SuanbaoPetInner />
    </ErrorBoundary>
  )
}
