import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  NumberInput,
  Progress,
  RingProgress,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { IconCheck, IconDeviceMobile, IconSettings, IconSparkles } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SuanbaoMascot } from '@/components/suanbao/SuanbaoMascot'
import '@/components/suanbao/suanbao.css'
import Page from '@/components/layout/Page'
import { useAndroidAgentApprovalStore } from '@/packages/android-agent/approval-store'
import { useAndroidAgentStore } from '@/packages/android-agent/controller'
import { isMobileFilePickerAvailable, mobileFileNative } from '@/packages/android-agent/file-native'
import type { MobileFile } from '@/packages/android-agent/file-types'
import { androidAgentNative, isAndroidAgentAvailable } from '@/packages/android-agent/native'
import type { AndroidAgentAppId, AndroidAgentTaskState } from '@/packages/android-agent/types'

export const Route = createFileRoute('/android-agent/')({ component: AndroidAgentPage })

type ActionName = 'start' | 'pause' | 'resume' | 'stop' | 'refresh'
type TabName = 'pet' | 'assistant' | 'settings'

const taskPresentation: Record<AndroidAgentTaskState, { labelKey: string; color: string }> = {
  idle: { labelKey: 'Standby', color: 'gray' },
  running: { labelKey: 'Running', color: 'green' },
  paused: { labelKey: 'Paused', color: 'yellow' },
  stopped: { labelKey: 'Stopped', color: 'gray' },
  failed: { labelKey: 'Failed', color: 'red' },
}

const terminalReasonText: Record<string, string> = {
  user_stopped: 'Stopped by you',
  foreground_changed: 'The target app left the foreground, the task stopped safely',
  snapshot_stale: 'The page content has changed, please refresh and start again',
  budget_exhausted: 'The operation budget has been used up',
  deadline_exceeded: 'The task has reached its time limit',
}

function petStateForTask(
  t: (key: string) => string,
  task: { state: AndroidAgentTaskState; terminalReason?: string },
  hasPendingApproval: boolean
) {
  if (hasPendingApproval && (task.state === 'running' || task.state === 'paused')) {
    return { state: 'waitingApproval' as const, message: t('Waiting for your approval') }
  }
  switch (task.state) {
    case 'running':
      return { state: 'executing' as const, message: t('Executing task…') }
    case 'paused':
      return { state: 'executing' as const, message: t('Task paused') }
    case 'failed':
      return {
        state: 'error' as const,
        message: (task.terminalReason && t(terminalReasonText[task.terminalReason])) || t('Task failed'),
      }
    default:
      return { state: 'idle' as const }
  }
}

function friendlyError(t: (key: string) => string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const code = message.match(/([A-Z_]{3,}):/)?.[1]
  const known: Record<string, string> = {
    ACCESSIBILITY_DISABLED: 'Please enable the KOD phone control service first.',
    APP_NOT_INSTALLED: 'The selected app is not installed. Please install it and try again.',
    OVERLAY_PERMISSION_REQUIRED: 'Please grant the \u201cDisplay over other apps\u201d permission first.',
    GOAL_BLOCKED: 'The task goal is empty, too long, or contains sensitive content. Please modify it and try again.',
    TASK_ACTIVE: 'A task is already running. Please stop the current task first.',
    FOREGROUND_CHANGED: 'The target app left the foreground, the task stopped safely.',
    BUDGET_EXHAUSTED: 'The operation budget has been used up. Please adjust the budget and start again.',
  }
  return (code && known[code]) || message
}

function AndroidAgentPage() {
  const { t } = useTranslation()
  const store = useAndroidAgentStore()
  const approvalRequest = useAndroidAgentApprovalStore((state) => state.request)
  const [tab, setTab] = useState<TabName>('pet')
  const [appId, setAppId] = useState<AndroidAgentAppId>('wechat')
  const [goal, setGoal] = useState('')
  const [budget, setBudget] = useState(30)
  const [durationMinutes, setDurationMinutes] = useState(5)
  const [initializing, setInitializing] = useState(true)
  const [taskError, setTaskError] = useState('')
  const [petError, setPetError] = useState('')
  const [fileError, setFileError] = useState('')
  const [activeAction, setActiveAction] = useState<ActionName>()
  const [actionSuccess, setActionSuccess] = useState<{ action: ActionName; label: string } | null>(null)
  const [now, setNow] = useState(Date.now())
  const [mobileFile, setMobileFile] = useState<MobileFile>()
  const [fileBusy, setFileBusy] = useState(false)
  const [overlayPermission, setOverlayPermission] = useState(false)
  const [overlayRunning, setOverlayRunning] = useState(false)
  const [overlayLifecycle, setOverlayLifecycle] = useState('stopped')
  const [petSize, setPetSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [petOpacity, setPetOpacity] = useState(1)
  const [petMotion, setPetMotion] = useState<'full' | 'reduced' | 'off'>('full')
  const [edgeSnap, setEdgeSnap] = useState(true)
  const [positionLocked, setPositionLocked] = useState(false)
  const [overlayBusy, setOverlayBusy] = useState(false)
  const [petPosition, setPetPosition] = useState({ x: 0, y: 0 })
  const petDrag = useRef<{ x: number; y: number; pointerX: number; pointerY: number }>()

  const refreshCapabilities = async () => {
    const [, overlay] = await Promise.all([store.refresh(), androidAgentNative.getOverlayStatus()])
    setOverlayPermission(overlay.permissionGranted)
    setOverlayRunning(overlay.running)
    setOverlayLifecycle(overlay.lifecycleState || (overlay.running ? 'visible' : 'stopped'))
    setPetSize(overlay.size || 'medium')
    setPetOpacity(overlay.opacity ?? 1)
    setPetMotion(overlay.motion || 'full')
    setEdgeSnap(overlay.edgeSnap ?? true)
    setPositionLocked(overlay.positionLocked ?? false)
  }

  useEffect(() => {
    if (!isAndroidAgentAvailable()) return
    setInitializing(true)
    void refreshCapabilities()
      .then(() => setTaskError(''))
      .catch((error) => setTaskError(friendlyError(t, error)))
      .finally(() => setInitializing(false))
  }, [store.refresh])

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== 'visible') return
      void refreshCapabilities().catch((error) => setTaskError(friendlyError(t, error)))
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
    }
  }, [store.refresh])

  useEffect(() => {
    if (!isAndroidAgentAvailable()) return
    let handle: { remove: () => Promise<void> } | undefined
    void androidAgentNative
      .onOverlayStateChanged((status) => {
        setOverlayPermission(status.permissionGranted)
        setOverlayRunning(status.running)
        setOverlayLifecycle(status.lifecycleState || (status.running ? 'visible' : 'stopped'))
        if (status.size) setPetSize(status.size)
        if (status.opacity !== undefined) setPetOpacity(status.opacity)
        if (status.motion) setPetMotion(status.motion)
        if (status.edgeSnap !== undefined) setEdgeSnap(status.edgeSnap)
        if (status.positionLocked !== undefined) setPositionLocked(status.positionLocked)
        if (status.lastError)
          setPetError(String(t('Failed to start the system overlay: {{error}}', { error: status.lastError })))
      })
      .then((listener) => {
        handle = listener
      })
    return () => {
      void handle?.remove()
    }
  }, [])

  useEffect(() => {
    if (!isAndroidAgentAvailable()) return
    const petState = petStateForTask(t, store.task, Boolean(approvalRequest))
    void androidAgentNative.setOverlayAssistantState(petState.state, petState.message).catch(() => undefined)
  }, [store.task, approvalRequest])

  useEffect(() => {
    const installed = store.apps.find((app) => app.installed)
    if (installed && !store.apps.find((app) => app.id === appId)?.installed) setAppId(installed.id)
  }, [store.apps, appId])

  useEffect(() => {
    if (store.task.state !== 'running' && store.task.state !== 'paused') return
    const timer = setInterval(() => {
      setNow(Date.now())
      void store.refresh().catch(() => undefined)
    }, 1000)
    return () => clearInterval(timer)
  }, [store.task.state, store.refresh])

  if (!isAndroidAgentAvailable()) {
    return (
      <Page title={t('Suanbao Assistant')}>
        <Center h="100%">
          <Alert color="yellow">{t('Suanbao Assistant is only available in the Android app.')}</Alert>
        </Center>
      </Page>
    )
  }

  if (initializing) {
    return (
      <Page title={t('Suanbao Assistant')}>
        <Center h="100%">
          <Stack align="center">
            <Loader />
            <Text c="dimmed">{t('Checking desktop pet and phone assistant status…')}</Text>
          </Stack>
        </Center>
      </Page>
    )
  }

  const selectedApp = store.apps.find((app) => app.id === appId)
  const installedApps = store.apps.filter((app) => app.installed)
  const canStart = Boolean(goal.trim() && store.accessibilityEnabled && selectedApp?.installed && !activeAction)
  const remainingSeconds = store.task.deadlineAt
    ? Math.max(0, Math.ceil((store.task.deadlineAt - now) / 1000))
    : undefined
  const taskStatus = taskPresentation[store.task.state]
  const petState = petStateForTask(t, store.task, Boolean(approvalRequest))
  const petStateLabel: Record<string, string> = {
    idle: t('Idle'),
    thinking: t('Thinking'),
    executing: t('Executing'),
    success: t('Task completed'),
    error: t('Encountered a problem'),
    waitingApproval: t('Waiting for your approval'),
  }

  const runTaskAction = async (name: ActionName, action: () => Promise<unknown>, successLabel: string) => {
    setTaskError('')
    setActiveAction(name)
    try {
      await action()
      setActionSuccess({ action: name, label: successLabel })
      window.setTimeout(() => setActionSuccess(null), 1200)
    } catch (error) {
      setTaskError(friendlyError(t, error))
    } finally {
      setActiveAction(undefined)
    }
  }

  const runOverlayAction = async (action: () => Promise<{ permissionGranted: boolean; running: boolean }>) => {
    setPetError('')
    setOverlayBusy(true)
    try {
      const status = await action()
      setOverlayPermission(status.permissionGranted)
      setOverlayRunning(status.running)
    } catch (error) {
      setPetError(friendlyError(t, error))
    } finally {
      setOverlayBusy(false)
    }
  }

  return (
    <Page title={t('Suanbao Assistant')}>
      <Box maw={720} mx="auto" p="md" w="100%">
        <Tabs value={tab} onChange={(value) => value && setTab(value as TabName)} keepMounted>
          <Tabs.List grow mb="md">
            <Tabs.Tab value="pet" leftSection={<IconSparkles size={18} />}>
              {t('Desktop Pet')}
            </Tabs.Tab>
            <Tabs.Tab value="assistant" leftSection={<IconDeviceMobile size={18} />}>
              {t('Phone Assistant')}
            </Tabs.Tab>
            <Tabs.Tab value="settings" leftSection={<IconSettings size={18} />}>
              {t('Settings')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="pet">
            <PetPanel
              taskState={store.task.state}
              overlayPermission={overlayPermission}
              overlayRunning={overlayRunning}
              overlayLifecycle={overlayLifecycle}
              overlayBusy={overlayBusy}
              error={petError}
              petPosition={petPosition}
              petDrag={petDrag}
              setPetPosition={setPetPosition}
              onGrant={() => {
                setOverlayBusy(true)
                setPetError('')
                void androidAgentNative
                  .openOverlaySettings()
                  .catch((error) => setPetError(friendlyError(t, error)))
                  .finally(() => setOverlayBusy(false))
              }}
              onStart={() => void runOverlayAction(androidAgentNative.startOverlayPet)}
              onStop={() => void runOverlayAction(androidAgentNative.stopOverlayPet)}
              petSize={petSize}
              petOpacity={petOpacity}
              petMotion={petMotion}
              edgeSnap={edgeSnap}
              positionLocked={positionLocked}
              onAppearanceChange={(options: any) => {
                if (options.size) setPetSize(options.size)
                if (options.opacity !== undefined) setPetOpacity(options.opacity)
                if (options.motion) setPetMotion(options.motion)
                if (options.edgeSnap !== undefined) setEdgeSnap(options.edgeSnap)
                if (options.positionLocked !== undefined) setPositionLocked(options.positionLocked)
                void runOverlayAction(() => androidAgentNative.updateOverlayPreferences(options))
              }}
              petState={petState}
              petStateLabel={petStateLabel}
            />
          </Tabs.Panel>

          <Tabs.Panel value="assistant">
            <AssistantPanel
              store={store}
              appId={appId}
              setAppId={setAppId}
              goal={goal}
              setGoal={setGoal}
              remainingSeconds={remainingSeconds}
              taskStatus={taskStatus}
              taskError={taskError}
              activeAction={activeAction}
              actionSuccess={actionSuccess}
              canStart={canStart}
              installedApps={installedApps.length}
              onOpenAccessibility={() => void androidAgentNative.openAccessibilitySettings()}
              onStart={() =>
                void runTaskAction(
                  'start',
                  () => store.start(appId, goal, budget, durationMinutes * 60_000),
                  t('Started')
                )
              }
              onPause={() => void runTaskAction('pause', store.pause, t('Paused'))}
              onResume={() => void runTaskAction('resume', store.resume, t('Resumed'))}
              onStop={() => void runTaskAction('stop', store.stop, t('Stopped'))}
              onRefresh={() => void runTaskAction('refresh', store.refresh, t('Refreshed'))}
            />
          </Tabs.Panel>

          <Tabs.Panel value="settings">
            <SettingsPanel
              budget={budget}
              setBudget={setBudget}
              durationMinutes={durationMinutes}
              setDurationMinutes={setDurationMinutes}
              mobileFile={mobileFile}
              setMobileFile={setMobileFile}
              fileBusy={fileBusy}
              setFileBusy={setFileBusy}
              fileError={fileError}
              setFileError={setFileError}
              petSize={petSize}
              petOpacity={petOpacity}
              petMotion={petMotion}
              edgeSnap={edgeSnap}
              positionLocked={positionLocked}
              onAppearanceChange={(options: any) => {
                if (options.size) setPetSize(options.size)
                if (options.opacity !== undefined) setPetOpacity(options.opacity)
                if (options.motion) setPetMotion(options.motion)
                if (options.edgeSnap !== undefined) setEdgeSnap(options.edgeSnap)
                if (options.positionLocked !== undefined) setPositionLocked(options.positionLocked)
                void runOverlayAction(() => androidAgentNative.updateOverlayPreferences(options))
              }}
            />
          </Tabs.Panel>
        </Tabs>
      </Box>
    </Page>
  )
}

function PermissionStep({
  index,
  last,
  complete,
  busy,
  title,
  description,
  action,
}: {
  index: number
  last?: boolean
  complete: boolean
  busy?: boolean
  title: string
  description: string
  action?: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Box>
      <Group align="flex-start" wrap="nowrap">
        <Stack align="center" gap={6} style={{ flexShrink: 0 }}>
          <ThemeIcon
            color={complete ? 'green' : busy ? 'blue' : 'gray'}
            variant={complete ? 'filled' : 'light'}
            radius="xl"
            size={30}
          >
            {complete ? (
              <IconCheck size={18} />
            ) : busy ? (
              <Loader size={14} />
            ) : (
              <Text size="sm" fw={700}>
                {index}
              </Text>
            )}
          </ThemeIcon>
          {!last && <Box className={complete ? 'suanbao-step-line suanbao-step-line-complete' : 'suanbao-step-line'} />}
        </Stack>
        <Box style={{ flex: 1 }} pt={4}>
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text fw={600}>{title}</Text>
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            </Box>
            <Badge color={complete ? 'green' : busy ? 'blue' : 'yellow'} variant="light">
              {complete ? t('Completed') : busy ? t('Processing') : t('Pending setup')}
            </Badge>
          </Group>
          {action}
        </Box>
      </Group>
    </Box>
  )
}

function PetAppearanceCard(props: any) {
  const { t } = useTranslation()
  return (
    <Card withBorder radius="lg" padding="md">
      <Stack gap="md">
        <Box>
          <Text fw={600}>{t('Quick Appearance')}</Text>
          <Text size="sm" c="dimmed">
            {t('Settings sync to the system overlay pet immediately.')}
          </Text>
        </Box>
        <Box>
          <Text size="sm" mb={6}>
            {t('Pet size')}
          </Text>
          <SegmentedControl
            fullWidth
            value={props.petSize}
            onChange={(size) => props.onAppearanceChange({ size })}
            data={[
              { label: t('Small'), value: 'small' },
              { label: t('Medium'), value: 'medium' },
              { label: t('Large'), value: 'large' },
            ]}
          />
        </Box>
        <Box>
          <Group justify="space-between">
            <Text size="sm">{t('Opacity')}</Text>
            <Text size="sm" c="dimmed">
              {Math.round(props.petOpacity * 100)}%
            </Text>
          </Group>
          <Slider
            min={50}
            max={100}
            step={5}
            value={Math.round(props.petOpacity * 100)}
            onChangeEnd={(value) => props.onAppearanceChange({ opacity: value / 100 })}
          />
        </Box>
        <Box>
          <Text size="sm" mb={6}>
            {t('Animation')}
          </Text>
          <SegmentedControl
            fullWidth
            value={props.petMotion}
            onChange={(motion) => props.onAppearanceChange({ motion })}
            data={[
              { label: t('Full'), value: 'full' },
              { label: t('Reduced'), value: 'reduced' },
              { label: t('Off'), value: 'off' },
            ]}
          />
        </Box>
        <Switch
          label={t('Snap to screen edge after release')}
          description={t('When off, the pet can stay anywhere within the screen safe area')}
          checked={props.edgeSnap}
          onChange={(event) => props.onAppearanceChange({ edgeSnap: event.currentTarget.checked })}
        />
        <Switch
          label={t('Lock current position to prevent accidental dragging')}
          description={t('When locked, a single tap still opens the quick menu')}
          checked={props.positionLocked}
          onChange={(event) => props.onAppearanceChange({ positionLocked: event.currentTarget.checked })}
        />
      </Stack>
    </Card>
  )
}

function PetPanel(props: any) {
  const { t } = useTranslation()
  return (
    <Stack>
      <Card withBorder padding="lg" radius="lg" style={{ background: 'rgba(225, 245, 224, 0.38)' }}>
        <Stack align="center" gap="sm">
          <Box
            style={{
              transform: `translate(${props.petPosition.x}px, ${props.petPosition.y}px)`,
              touchAction: 'none',
              cursor: 'grab',
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              props.petDrag.current = {
                x: props.petPosition.x,
                y: props.petPosition.y,
                pointerX: event.clientX,
                pointerY: event.clientY,
              }
            }}
            onPointerMove={(event) => {
              if (props.petDrag.current)
                props.setPetPosition({
                  x: props.petDrag.current.x + event.clientX - props.petDrag.current.pointerX,
                  y: props.petDrag.current.y + event.clientY - props.petDrag.current.pointerY,
                })
            }}
            onPointerUp={() => {
              props.petDrag.current = undefined
            }}
            onPointerCancel={() => {
              props.petDrag.current = undefined
            }}
            onTouchStart={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            <SuanbaoMascot
              state={
                props.petState.state === 'thinking'
                  ? 'thinking'
                  : props.petState.state === 'executing'
                    ? 'executing'
                    : props.petState.state === 'error'
                      ? 'error'
                      : props.petState.state === 'success'
                        ? 'success'
                        : 'idle'
              }
              animation="full"
            />
          </Box>
          <Group gap={6}>
            <Title order={3}>{t('Hi, I am Suanbao')}</Title>
            <Badge
              color={
                props.petState.state === 'waitingApproval'
                  ? 'yellow'
                  : props.petState.state === 'error'
                    ? 'red'
                    : props.petState.state === 'executing'
                      ? 'green'
                      : 'gray'
              }
            >
              {props.petStateLabel[props.petState.state]}
            </Badge>
          </Group>
          {props.petState.message && (
            <Text size="sm" ta="center" c={props.petState.state === 'error' ? 'red' : 'dimmed'}>
              {props.petState.message}
            </Text>
          )}
          <Text size="sm" c="dimmed" ta="center">
            {t('Drag me inside KOD, or enable the system overlay pet so I can stay with you while you use other apps.')}
          </Text>
        </Stack>
      </Card>
      {props.error && (
        <Alert color="red" title={t('Desktop pet operation failed')}>
          {props.error}
        </Alert>
      )}
      <Card withBorder radius="lg" padding="md">
        <Stack gap="lg">
          <PermissionStep
            index={1}
            last={false}
            complete={props.overlayPermission}
            title={t('Allow overlay display')}
            description={t('Used to show Suanbao above other apps; you can revoke it anytime in system settings.')}
            action={
              !props.overlayPermission ? (
                <Button mt="xs" variant="light" loading={props.overlayBusy} onClick={props.onGrant}>
                  {t('Go to system settings')}
                </Button>
              ) : undefined
            }
          />
          <PermissionStep
            index={2}
            last={true}
            complete={props.overlayRunning}
            busy={props.overlayLifecycle === 'starting'}
            title={t('Enable system desktop pet')}
            description={
              props.overlayLifecycle === 'starting'
                ? t('The system is starting the overlay pet…')
                : props.overlayRunning
                  ? t('Suanbao is showing above other apps.')
                  : t(
                      'After granting permission, you enable it manually. It will not start silently in the background.'
                    )
            }
            action={
              props.overlayPermission ? (
                <Button
                  mt="xs"
                  color={props.overlayRunning ? 'red' : 'blue'}
                  variant={props.overlayRunning ? 'light' : 'filled'}
                  loading={props.overlayBusy || props.overlayLifecycle === 'starting'}
                  onClick={props.overlayRunning ? props.onStop : props.onStart}
                >
                  {props.overlayRunning ? t('Turn off pet') : t('Turn on pet')}
                </Button>
              ) : undefined
            }
          />
        </Stack>
      </Card>
      <PetAppearanceCard {...props} />
    </Stack>
  )
}

function AssistantPanel(props: any) {
  const { t } = useTranslation()
  const task = props.store.task
  const running = task.state === 'running'
  const paused = task.state === 'paused'
  const totalSeconds =
    task.startedAt && task.deadlineAt ? Math.max(1, Math.ceil((task.deadlineAt - task.startedAt) / 1000)) : 1
  const ringValue =
    totalSeconds > 0 && props.remainingSeconds !== undefined
      ? Math.max(0, Math.min(100, Math.round((props.remainingSeconds / totalSeconds) * 100)))
      : 0
  const ringColor =
    task.state === 'failed' ? 'red' : task.state === 'paused' ? 'yellow' : task.state === 'running' ? 'green' : 'gray'
  const budgetTotal = task.budget ?? 0
  const budgetValue =
    budgetTotal > 0 ? Math.max(0, Math.min(100, Math.round(((task.remainingBudget ?? 0) / budgetTotal) * 100))) : 0
  const success = props.actionSuccess?.action
  const showStatus = Boolean(task.taskId && task.state !== 'idle')

  const successButton = (action: string, label: string) => {
    if (success !== action) return null
    return (
      <Button key={`success-${action}`} color="green" variant="light" leftSection={<IconCheck size={18} />}>
        {label}
      </Button>
    )
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Box>
          <Title order={3}>{t('Phone Task Control')}</Title>
          <Text size="sm" c="dimmed">
            {t('Only WeChat and QQ are supported. Every write operation requires your one-time approval.')}
          </Text>
        </Box>
        <Badge color={props.taskStatus.color} size="lg">
          {props.taskStatus.label}
        </Badge>
      </Group>

      {!props.store.accessibilityEnabled && (
        <PermissionStep
          index={1}
          last={true}
          complete={false}
          title={t('Enable KOD phone control service')}
          description={t(
            'Reads the target app UI and performs actions you approve; payment, passwords and verification codes are always blocked.'
          )}
          action={
            <Button mt="xs" variant="light" onClick={props.onOpenAccessibility}>
              {t('Go to accessibility settings')}
            </Button>
          }
        />
      )}
      {props.store.accessibilityEnabled && (
        <PermissionStep
          index={1}
          last={true}
          complete
          title={t('KOD phone control service is enabled')}
          description={t('You can turn it off anytime from Android accessibility settings.')}
        />
      )}

      {props.installedApps === 0 ? (
        <Card withBorder radius="lg" padding="xl">
          <Stack align="center" gap="sm">
            <SuanbaoMascot state="idle" animation="full" />
            <Title order={4}>{t('No supported app found')}</Title>
            <Text size="sm" c="dimmed" ta="center">
              {t('Install WeChat or QQ to use the phone assistant control.')}
            </Text>
            <Button variant="light" loading={props.activeAction === 'refresh'} onClick={props.onRefresh}>
              {t('Refresh status')}
            </Button>
          </Stack>
        </Card>
      ) : (
        <>
          {props.taskError && (
            <Alert color="red" title={t('Task operation failed')}>
              {props.taskError}
            </Alert>
          )}
          <Card withBorder radius="md" padding="md">
            <Stack>
              <Select
                label={t('Target app')}
                value={props.appId}
                onChange={(value) => value && props.setAppId(value)}
                data={props.store.apps.map((app: any) => ({
                  value: app.id,
                  label: `${app.id === 'wechat' ? t('WeChat') : t('QQ')}${app.installed ? '' : t(' (not installed)')}`,
                  disabled: !app.installed,
                }))}
              />
              <Textarea
                label={t('Task goal')}
                placeholder={
                  t('For example: open the chat with Zhang San and find the most recent message') || undefined
                }
                value={props.goal}
                onChange={(event) => props.setGoal(event.currentTarget.value)}
                maxLength={500}
                minRows={3}
              />
              {!props.canStart && props.goal.trim() && (
                <Text size="xs" c="dimmed">
                  {t('Please complete the accessibility setup first and select an installed target app.')}
                </Text>
              )}

              {showStatus && (
                <Card withBorder padding="md" radius="md">
                  <Group align="center" wrap="nowrap">
                    <RingProgress
                      size={84}
                      thickness={8}
                      roundCaps
                      sections={[{ value: ringValue, color: ringColor }]}
                      label={
                        <Center>
                          <Text size="xs" fw={700}>
                            {props.remainingSeconds ?? '-'}s
                          </Text>
                        </Center>
                      }
                    />
                    <Stack gap={4} style={{ flex: 1 }}>
                      <Text fw={600}>{t('Current task progress')}</Text>
                      <Group gap={6}>
                        <Text size="sm" c="dimmed">
                          {t('Remaining budget')}
                        </Text>
                        <Box style={{ flex: 1 }}>
                          <Progress value={budgetValue} color={ringColor} size="sm" radius="xl" />
                        </Box>
                        <Text size="sm" fw={600}>
                          {task.remainingBudget ?? '-'} / {task.budget ?? '-'}
                        </Text>
                      </Group>
                      {task.terminalReason && (
                        <Text size="sm" c={task.state === 'failed' ? 'red' : 'dimmed'}>
                          {terminalReasonText[task.terminalReason] || task.terminalReason}
                        </Text>
                      )}
                      <Text size="xs" c="dimmed">
                        {t('Diagnostics: g{{generation}} · protocol {{version}}', {
                          generation: task.generation ?? '-',
                          version: task.protocolVersion ?? '-',
                        })}
                      </Text>
                    </Stack>
                  </Group>
                </Card>
              )}

              <Group>
                {['idle', 'stopped', 'failed'].includes(task.state) &&
                  (success === 'start' ? (
                    successButton('start', t('Started'))
                  ) : (
                    <Button disabled={!props.canStart} loading={props.activeAction === 'start'} onClick={props.onStart}>
                      {t('Start Task')}
                    </Button>
                  ))}
                {running &&
                  (success === 'pause' ? (
                    successButton('pause', t('Paused'))
                  ) : (
                    <Button variant="light" loading={props.activeAction === 'pause'} onClick={props.onPause}>
                      {t('Pause')}
                    </Button>
                  ))}
                {paused &&
                  (success === 'resume' ? (
                    successButton('resume', t('Resumed'))
                  ) : (
                    <Button loading={props.activeAction === 'resume'} onClick={props.onResume}>
                      {t('Resume')}
                    </Button>
                  ))}
                {(running || paused) &&
                  (success === 'stop' ? (
                    successButton('stop', t('Stopped'))
                  ) : (
                    <Button color="red" variant="light" loading={props.activeAction === 'stop'} onClick={props.onStop}>
                      {t('Stop')}
                    </Button>
                  ))}
                {!success && (
                  <Button
                    variant="subtle"
                    loading={props.activeAction === 'refresh'}
                    disabled={Boolean(props.activeAction)}
                    onClick={props.onRefresh}
                  >
                    {t('Refresh status')}
                  </Button>
                )}
              </Group>
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  )
}

function SettingsPanel(props: any) {
  const { t } = useTranslation()
  const fileAction = (action: () => Promise<void>) => {
    props.setFileError('')
    props.setFileBusy(true)
    void action()
      .catch((error) => props.setFileError(friendlyError(t, error)))
      .finally(() => props.setFileBusy(false))
  }
  return (
    <Stack>
      <Card withBorder radius="md" padding="md">
        <Stack>
          <Title order={4}>{t('Task Limits')}</Title>
          <Text size="sm" c="dimmed">
            {t('Lower budgets and time limits reduce the risk of misoperation.')}
          </Text>
          <Group grow>
            <NumberInput
              label={t('Operation budget')}
              min={1}
              max={100}
              value={props.budget}
              onChange={(value) => props.setBudget(Number(value) || 1)}
            />
            <NumberInput
              label={t('Time limit (minutes)')}
              min={1}
              max={15}
              value={props.durationMinutes}
              onChange={(value) => props.setDurationMinutes(Number(value) || 1)}
            />
          </Group>
        </Stack>
      </Card>
      <PetAppearanceCard {...props} />
      <Alert color="blue" title={t('Safety boundary')}>
        {t(
          'Only WeChat and QQ are supported; every write operation requires approval, and payment, transfers, passwords, verification codes and credential fields are always blocked.'
        )}
      </Alert>
      {isMobileFilePickerAvailable() && (
        <Card withBorder radius="md" padding="md">
          <Stack gap="xs">
            <Title order={4}>{t('Phone Files')}</Title>
            <Text size="sm" c="dimmed">
              {t('Choose images, PDFs or text files; files are not uploaded automatically.')}
            </Text>
            {props.fileError && <Alert color="red">{props.fileError}</Alert>}
            <Group>
              <Button
                size="sm"
                loading={props.fileBusy}
                onClick={() =>
                  fileAction(async () => {
                    const result = await mobileFileNative.pickFile('image')
                    if (!result.cancelled) props.setMobileFile(result.files[0])
                  })
                }
              >
                {t('Choose photo')}
              </Button>
              <Button
                size="sm"
                variant="light"
                loading={props.fileBusy}
                onClick={() =>
                  fileAction(async () => {
                    const result = await mobileFileNative.pickFile('document')
                    if (!result.cancelled) props.setMobileFile(result.files[0])
                  })
                }
              >
                {t('Choose document')}
              </Button>
              {props.mobileFile && (
                <Button
                  size="sm"
                  variant="light"
                  loading={props.fileBusy}
                  onClick={() =>
                    fileAction(() => mobileFileNative.shareFile(props.mobileFile.token).then(() => undefined))
                  }
                >
                  {t('Share')}
                </Button>
              )}
              {props.mobileFile && (
                <Button
                  size="sm"
                  color="red"
                  variant="light"
                  loading={props.fileBusy}
                  onClick={() =>
                    fileAction(() =>
                      mobileFileNative.revokeFile(props.mobileFile.token).then(() => props.setMobileFile(undefined))
                    )
                  }
                >
                  {t('Revoke')}
                </Button>
              )}
            </Group>
            {props.mobileFile && (
              <Text size="xs" truncate>
                {props.mobileFile.name} · {props.mobileFile.mimeType} · {Math.ceil(props.mobileFile.size / 1024)} KiB
              </Text>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
