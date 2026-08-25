import { Alert, Button, Group, Paper, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import {
  getLocalDemoCapability,
  type LocalDemoCapability,
  type LocalDemoRole,
  type LocalDemoSession,
  switchLocalDemoRole,
} from '@/packages/computeCenter'
import { getKodApiOrigin } from '@/packages/remote'

const ROLE_LABELS: Record<LocalDemoRole, string> = {
  ADMIN: '管理员',
  HOSTING_TENANT: '托管租户',
  GPU_BUYER: 'GPU 买家',
}

const LOCAL_DEMO_SESSION_TIMEOUT_MS = 15_000

export function isGuardedLocalDemoOrigin(apiOrigin: string) {
  try {
    const origin = new URL(apiOrigin)
    return (
      origin.protocol === 'http:' &&
      !origin.username &&
      !origin.password &&
      (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1' || origin.hostname === '[::1]')
    )
  } catch {
    return false
  }
}

export function LocalDemoRoleSwitcher({
  apiOrigin = getKodApiOrigin(),
  onSession,
}: {
  apiOrigin?: string
  onSession: (session: LocalDemoSession) => void | Promise<void>
}) {
  const [capability, setCapability] = useState<LocalDemoCapability | null>(null)
  const [busyRole, setBusyRole] = useState<LocalDemoRole | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestGeneration = useRef(0)
  const capabilityAbort = useRef<AbortController | null>(null)
  const sessionAbort = useRef<AbortController | null>(null)
  const busyRoleRef = useRef<LocalDemoRole | null>(null)

  useEffect(() => {
    requestGeneration.current += 1
    const generation = requestGeneration.current
    capabilityAbort.current?.abort()
    sessionAbort.current?.abort()
    setCapability(null)
    setBusyRole(null)
    busyRoleRef.current = null
    setError(null)
    if (!isGuardedLocalDemoOrigin(apiOrigin)) return

    const controller = new AbortController()
    capabilityAbort.current = controller
    void getLocalDemoCapability(controller.signal)
      .then((nextCapability) => {
        if (requestGeneration.current !== generation || controller.signal.aborted || !nextCapability.enabled) return
        setCapability(nextCapability)
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [apiOrigin])

  useEffect(
    () => () => {
      requestGeneration.current += 1
      capabilityAbort.current?.abort()
      sessionAbort.current?.abort()
    },
    []
  )

  const selectRole = (role: LocalDemoRole) => {
    if (!capability?.roles.includes(role) || busyRoleRef.current === role) return
    requestGeneration.current += 1
    const generation = requestGeneration.current
    sessionAbort.current?.abort()
    const controller = new AbortController()
    sessionAbort.current = controller
    busyRoleRef.current = role
    setBusyRole(role)
    setError(null)
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, LOCAL_DEMO_SESSION_TIMEOUT_MS)

    void switchLocalDemoRole(role, controller.signal)
      .then(async (session) => {
        if (requestGeneration.current !== generation || controller.signal.aborted) return
        await onSession(session)
      })
      .catch((reason: unknown) => {
        if (requestGeneration.current !== generation || (controller.signal.aborted && !timedOut)) return
        setError(
          timedOut ? '演示角色切换超时，请重试' : reason instanceof Error ? reason.message : '演示角色切换失败，请重试'
        )
      })
      .finally(() => {
        window.clearTimeout(timeout)
        if (requestGeneration.current !== generation) return
        busyRoleRef.current = null
        setBusyRole(null)
      })
  }

  if (!capability?.enabled || capability.roles.length === 0) return null

  return (
    <Paper withBorder p="xs" radius="md" bg="green.0" role="group" aria-label="本地演示角色">
      <Group gap="xs" wrap="wrap">
        <Text size="xs" fw={700} c="green.9">
          本地演示角色
        </Text>
        {capability.roles.map((role) => (
          <Button
            key={role}
            size="compact-xs"
            variant="light"
            color="green"
            loading={busyRole === role}
            disabled={busyRole === role}
            onClick={() => selectRole(role)}
          >
            {ROLE_LABELS[role]}
          </Button>
        ))}
      </Group>
      {error && (
        <Alert mt="xs" color="red" variant="light" py={4} px="xs">
          {error}
        </Alert>
      )}
    </Paper>
  )
}
