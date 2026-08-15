import { Button, Paper, Stack, Text } from '@mantine/core'
import { tinpaySessionIdSchema } from '@shared/tinpay'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createTinpaySession, getTinpaySession, type TinpayStatus } from '@/packages/tinpay'
import platform from '@/platform'

const PENDING: ReadonlySet<TinpayStatus['status']> = new Set([
  'CREATED',
  'READY',
  'RECORDING',
  'TRANSCRIBED',
  'MATCHED',
  'RETRY_REQUIRED',
])
const isPending = (value: TinpayStatus['status'] | 'idle'): value is TinpayStatus['status'] =>
  value !== 'idle' && PENDING.has(value)
const STORAGE_KEY = 'kod.tinpay.demo.active'
const isWindowsElectron = platform.type === 'desktop' && navigator.userAgent.toLowerCase().includes('windows')
type Session = {
  sessionId: string
  checkoutUrl: string
  expiresAt: string
  demoOnly: true
  status?: TinpayStatus['status']
}
function loadSession(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return value && tinpaySessionIdSchema.safeParse(value.sessionId).success ? value : null
  } catch {
    return null
  }
}
export function TinpayDemoCard() {
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [status, setStatus] = useState<TinpayStatus['status'] | 'idle'>(() => loadSession()?.status || 'idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const request = useRef<Promise<void> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abort = useRef<AbortController | null>(null)
  const check = useCallback((id: string): Promise<void> => {
    if (request.current) return request.current
    request.current = getTinpaySession(id, abort.current?.signal)
      .then((result) => {
        setStatus(result.status)
        setSession((old) => (old ? { ...old, ...result } : old))
        if (PENDING.has(result.status) && Date.parse(result.expiresAt) > Date.now())
          timer.current = setTimeout(() => {
            timer.current = null
            void check(id)
          }, 2500)
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setError(true)
      })
      .finally(() => {
        request.current = null
      })
    return request.current
  }, [])
  const start = async () => {
    if (loading) return
    setLoading(true)
    setError(false)
    abort.current = new AbortController()
    try {
      const result = await createTinpaySession(
        {
          product: 'chatbox-ai',
          scene: 'settings',
          electron: {
            platform: 'windows',
            container: 'electron',
            hostAppId: 'kod-electron',
            appVersion: await platform.getVersion(),
          },
        },
        abort.current.signal
      )
      setSession(result)
      setStatus(result.status || 'CREATED')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result))
      await window.electronAPI.tinpay.open(result)
      void check(result.sessionId)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (!isWindowsElectron) return
    abort.current = new AbortController()
    const refresh = (id = session?.sessionId) => {
      if (id && isPending(status)) void check(id)
    }
    const offNotification = window.electronAPI.tinpay.onNotification((n) => {
      if (n.sessionId === session?.sessionId) refresh(n.sessionId)
    })
    const offFocus = platform.onWindowFocused(() => refresh())
    const offShow = platform.onWindowShow(() => refresh())
    if (session && Date.parse(session.expiresAt) > Date.now() && isPending(status)) void check(session.sessionId)
    return () => {
      offNotification()
      offFocus()
      offShow()
      abort.current?.abort()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [check, session, status])
  if (!isWindowsElectron) return null
  const active = !!session && isPending(status) && Date.parse(session.expiresAt) > Date.now()
  const completed = status === 'COMPLETED' && session?.demoOnly === true
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Text fw={600}>{t('Tinpay demo')}</Text>
        <Text c="chatbox-tertiary">
          {completed
            ? t('Tinpay demo completed. No real funds were deducted.')
            : t('This feature is currently a demo experience and will not result in an actual charge.')}
        </Text>
        {error && <Text c="red">{t('Unable to start or check the Tinpay demo.')}</Text>}
        <Button
          loading={loading}
          disabled={loading || (session !== null && !active)}
          onClick={() => (active && session ? void window.electronAPI.tinpay.open(session) : void start())}
        >
          {active ? t('Reopen demo') : t('Start demo')}
        </Button>
        {session && (
          <Button
            variant="subtle"
            disabled={!active}
            onClick={() =>
              void window.electronAPI.tinpay.openExternal({ sessionId: tinpaySessionIdSchema.parse(session.sessionId) })
            }
          >
            {t('Open in browser')}
          </Button>
        )}
      </Stack>
    </Paper>
  )
}
