import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import {
  getLocalDemoCapability,
  getLocalDemoScenario,
  type LocalDemoCapability,
  type LocalDemoRole,
  type LocalDemoScenario,
  type LocalDemoSession,
  parseLocalDemoApiOrigin,
  runLocalDemoScenario,
  switchLocalDemoRole,
} from '@/packages/computeCenter'
import { getKodApiOrigin } from '@/packages/remote'
import { useAuthInfoStore } from '@/stores/authInfoStore'

const ROLE_LABELS: Record<LocalDemoRole, string> = {
  ADMIN: '管理员',
  HOSTING_TENANT: '托管租户',
  GPU_BUYER: 'GPU 买家',
}

const LOCAL_DEMO_SESSION_TIMEOUT_MS = 15_000

export function isGuardedLocalDemoOrigin(apiOrigin: string) {
  try {
    parseLocalDemoApiOrigin(apiOrigin)
    return true
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
  const [scenario, setScenario] = useState<LocalDemoScenario | null>(null)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioRunning, setScenarioRunning] = useState(false)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const requestGeneration = useRef(0)
  const scenarioGeneration = useRef(0)
  const capabilityAbort = useRef<AbortController | null>(null)
  const sessionAbort = useRef<AbortController | null>(null)
  const scenarioAbort = useRef<AbortController | null>(null)
  const scenarioRunAbort = useRef<AbortController | null>(null)
  const busyRoleRef = useRef<LocalDemoRole | null>(null)
  const scenarioRunningRef = useRef(false)
  const authOwnerKey = useAuthInfoStore((state) =>
    JSON.stringify([state.accessToken, state.refreshToken, state.accountId, state.loginEmail])
  )
  const authOwnerKeyRef = useRef(authOwnerKey)
  authOwnerKeyRef.current = authOwnerKey

  useEffect(() => {
    requestGeneration.current += 1
    const generation = requestGeneration.current
    const capabilityOwnerKey = authOwnerKey
    capabilityAbort.current?.abort()
    sessionAbort.current?.abort()
    scenarioAbort.current?.abort()
    scenarioRunAbort.current?.abort()
    scenarioGeneration.current += 1
    setCapability(null)
    setBusyRole(null)
    busyRoleRef.current = null
    setError(null)
    setScenario(null)
    setScenarioLoading(false)
    setScenarioRunning(false)
    scenarioRunningRef.current = false
    setScenarioError(null)
    if (!isGuardedLocalDemoOrigin(apiOrigin)) return

    const controller = new AbortController()
    capabilityAbort.current = controller
    void getLocalDemoCapability(controller.signal, apiOrigin)
      .then((nextCapability) => {
        if (
          requestGeneration.current !== generation ||
          authOwnerKeyRef.current !== capabilityOwnerKey ||
          controller.signal.aborted ||
          !nextCapability.enabled
        )
          return
        setCapability(nextCapability)
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [apiOrigin, authOwnerKey])

  useEffect(() => {
    if (!capability?.enabled) return
    const generation = ++scenarioGeneration.current
    const scenarioOwnerKey = authOwnerKey
    const controller = new AbortController()
    scenarioAbort.current?.abort()
    scenarioAbort.current = controller
    setScenarioLoading(true)
    setScenarioError(null)

    void getLocalDemoScenario(controller.signal, apiOrigin)
      .then((nextScenario) => {
        if (
          scenarioGeneration.current !== generation ||
          authOwnerKeyRef.current !== scenarioOwnerKey ||
          controller.signal.aborted
        )
          return
        setScenario(nextScenario)
      })
      .catch((reason: unknown) => {
        if (scenarioGeneration.current !== generation || controller.signal.aborted) return
        setScenarioError(reason instanceof Error ? reason.message : '本地演示状态加载失败')
      })
      .finally(() => {
        if (scenarioGeneration.current === generation) setScenarioLoading(false)
      })

    return () => controller.abort()
  }, [apiOrigin, authOwnerKey, capability?.enabled])

  useEffect(
    () => () => {
      requestGeneration.current += 1
      scenarioGeneration.current += 1
      capabilityAbort.current?.abort()
      sessionAbort.current?.abort()
      scenarioAbort.current?.abort()
      scenarioRunAbort.current?.abort()
    },
    []
  )

  const selectRole = (role: LocalDemoRole) => {
    if (!capability?.roles.includes(role) || busyRoleRef.current === role) return
    requestGeneration.current += 1
    const generation = requestGeneration.current
    const sessionOwnerKey = authOwnerKeyRef.current
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

    void switchLocalDemoRole(role, controller.signal, apiOrigin)
      .then(async (session) => {
        if (
          requestGeneration.current !== generation ||
          authOwnerKeyRef.current !== sessionOwnerKey ||
          controller.signal.aborted
        )
          return
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

  const runScenario = () => {
    if (!capability?.enabled || scenarioRunningRef.current) return
    const generation = ++scenarioGeneration.current
    const scenarioOwnerKey = authOwnerKeyRef.current
    const controller = new AbortController()
    scenarioAbort.current?.abort()
    scenarioRunAbort.current?.abort()
    scenarioRunAbort.current = controller
    scenarioRunningRef.current = true
    setScenarioLoading(false)
    setScenarioRunning(true)
    setScenarioError(null)

    void runLocalDemoScenario(controller.signal, apiOrigin)
      .then((nextScenario) => {
        if (
          scenarioGeneration.current !== generation ||
          authOwnerKeyRef.current !== scenarioOwnerKey ||
          controller.signal.aborted
        )
          return
        setScenario(nextScenario)
      })
      .catch((reason: unknown) => {
        if (scenarioGeneration.current !== generation || controller.signal.aborted) return
        setScenarioError(reason instanceof Error ? reason.message : '本地演示运行失败')
      })
      .finally(() => {
        if (scenarioGeneration.current !== generation) return
        scenarioRunningRef.current = false
        setScenarioRunning(false)
      })
  }

  if (!capability?.enabled || capability.roles.length === 0) return null

  return (
    <Paper withBorder p="xs" radius="md" bg="green.0" role="group" aria-label="本地演示角色">
      <Stack gap="xs">
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
        <Paper withBorder p="xs" radius="sm" bg="white">
          <Stack gap={4}>
            <Group justify="space-between" gap="xs" wrap="wrap">
              <Group gap="xs">
                <Text size="xs" fw={700}>
                  本地演示闭环
                </Text>
                {scenario && <Badge size="xs">阶段：{scenario.stage}</Badge>}
                {scenario && (
                  <Badge size="xs" color={scenario.reconciled ? 'green' : 'gray'}>
                    reconciled: {String(scenario.reconciled)}
                  </Badge>
                )}
              </Group>
              <Button size="compact-xs" loading={scenarioRunning} disabled={scenarioRunning} onClick={runScenario}>
                {scenario?.stage === 'COMPLETED' ? '重新对账演示结果' : '运行完整演示闭环'}
              </Button>
            </Group>
            {scenarioLoading && !scenario && (
              <Text size="xs" c="dimmed">
                正在读取本地演示状态…
              </Text>
            )}
            {scenario && (
              <>
                <SimpleGrid cols={{ base: 2, sm: 3 }} spacing={4} verticalSpacing={2}>
                  <Text size="xs">月租 {scenario.monthlyRentCardHours} 卡时</Text>
                  <Text size="xs">销售价 {scenario.salePriceCardHours} 卡时</Text>
                  <Text size="xs">结算收入 {scenario.settledIncomeCardHours} 卡时</Text>
                  <Text size="xs">买家奖励 {scenario.buyerRewardCardHours} 卡时</Text>
                  <Text size="xs">租户奖励 {scenario.tenantRewardCardHours} 卡时</Text>
                  <Text size="xs">可用库存 {scenario.skuAvailableInventory}</Text>
                </SimpleGrid>
                <Text size="10px" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  admin {scenario.adminAccountId} · tenant {scenario.tenantAccountId} · buyer {scenario.buyerAccountId}{' '}
                  · sku {scenario.skuId ?? '-'} · lease {scenario.leaseId ?? '-'} · product {scenario.productId ?? '-'}{' '}
                  · reservation {scenario.reservationId ?? '-'} · buyer eligibility {scenario.buyerEligibilityId ?? '-'}{' '}
                  · tenant eligibility {scenario.tenantEligibilityId ?? '-'}
                </Text>
              </>
            )}
          </Stack>
        </Paper>
      </Stack>
      {error && (
        <Alert mt="xs" color="red" variant="light" py={4} px="xs">
          {error}
        </Alert>
      )}
      {scenarioError && (
        <Alert mt="xs" color="red" variant="light" py={4} px="xs">
          {scenarioError}
        </Alert>
      )}
    </Paper>
  )
}
