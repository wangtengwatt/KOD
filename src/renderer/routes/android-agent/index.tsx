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
import { IconCheck, IconDeviceMobile, IconSettings, IconShieldCheck, IconSparkles } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { SuanbaoMascot } from '@/components/suanbao/SuanbaoMascot'
import '@/components/suanbao/suanbao.css'
import Page from '@/components/layout/Page'
import { useAndroidAgentStore } from '@/packages/android-agent/controller'
import { isMobileFilePickerAvailable, mobileFileNative } from '@/packages/android-agent/file-native'
import type { MobileFile } from '@/packages/android-agent/file-types'
import { androidAgentNative, isAndroidAgentAvailable } from '@/packages/android-agent/native'
import { useAndroidAgentApprovalStore } from '@/packages/android-agent/approval-store'
import type { AndroidAgentAppId, AndroidAgentTaskState } from '@/packages/android-agent/types'

export const Route = createFileRoute('/android-agent/')({ component: AndroidAgentPage })

type ActionName = 'start' | 'pause' | 'resume' | 'stop' | 'refresh'
type TabName = 'pet' | 'assistant' | 'settings'

const taskPresentation: Record<AndroidAgentTaskState, { label: string; color: string }> = {
  idle: { label: '待命', color: 'gray' },
  running: { label: '执行中', color: 'green' },
  paused: { label: '已暂停', color: 'yellow' },
  stopped: { label: '已停止', color: 'gray' },
  failed: { label: '执行失败', color: 'red' },
}

const terminalReasonText: Record<string, string> = {
  user_stopped: '已由你主动停止',
  foreground_changed: '目标应用已离开前台，任务已安全停止',
  snapshot_stale: '页面内容已变化，请刷新后重新开始',
  budget_exhausted: '操作预算已用完',
  deadline_exceeded: '任务已达到时间限制',
}

function petStateForTask(task: { state: AndroidAgentTaskState; terminalReason?: string }, hasPendingApproval: boolean) {
  if (hasPendingApproval && (task.state === 'running' || task.state === 'paused')) {
    return { state: 'waitingApproval' as const, message: '等待你的批准' }
  }
  switch (task.state) {
    case 'running':
      return { state: 'executing' as const, message: '正在执行任务…' }
    case 'paused':
      return { state: 'executing' as const, message: '任务已暂停' }
    case 'failed':
      return { state: 'error' as const, message: (task.terminalReason && terminalReasonText[task.terminalReason]) || '任务执行失败' }
    default:
      return { state: 'idle' as const }
  }
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const code = message.match(/([A-Z_]{3,}):/)?.[1]
  const known: Record<string, string> = {
    ACCESSIBILITY_DISABLED: '请先开启 KOD 手机控制服务。',
    APP_NOT_INSTALLED: '所选应用尚未安装，请安装后重试。',
    OVERLAY_PERMISSION_REQUIRED: '请先授予“显示在其他应用上层”权限。',
    GOAL_BLOCKED: '任务目标为空、过长或包含敏感内容，请修改后重试。',
    TASK_ACTIVE: '已有任务正在运行，请先停止当前任务。',
    FOREGROUND_CHANGED: '目标应用已离开前台，任务已安全停止。',
    BUDGET_EXHAUSTED: '操作预算已用完，请调整预算后重新开始。',
  }
  return (code && known[code]) || message
}

function AndroidAgentPage() {
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
      .catch((error) => setTaskError(friendlyError(error)))
      .finally(() => setInitializing(false))
  }, [store.refresh])

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== 'visible') return
      void refreshCapabilities().catch((error) => setTaskError(friendlyError(error)))
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
    void androidAgentNative.onOverlayStateChanged((status) => {
      setOverlayPermission(status.permissionGranted)
      setOverlayRunning(status.running)
      setOverlayLifecycle(status.lifecycleState || (status.running ? 'visible' : 'stopped'))
      if (status.size) setPetSize(status.size)
      if (status.opacity !== undefined) setPetOpacity(status.opacity)
      if (status.motion) setPetMotion(status.motion)
      if (status.edgeSnap !== undefined) setEdgeSnap(status.edgeSnap)
      if (status.positionLocked !== undefined) setPositionLocked(status.positionLocked)
      if (status.lastError) setPetError(`系统悬浮层启动失败：${status.lastError}`)
    }).then((listener) => { handle = listener })
    return () => { void handle?.remove() }
  }, [])

  useEffect(() => {
    if (!isAndroidAgentAvailable()) return
    const petState = petStateForTask(store.task, Boolean(approvalRequest))
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
    return <Page title="蒜宝助手"><Center h="100%"><Alert color="yellow">蒜宝助手仅在 Android 应用中可用。</Alert></Center></Page>
  }

  if (initializing) {
    return <Page title="蒜宝助手"><Center h="100%"><Stack align="center"><Loader /><Text c="dimmed">正在检查桌宠和手机助手状态…</Text></Stack></Center></Page>
  }

  const selectedApp = store.apps.find((app) => app.id === appId)
  const installedApps = store.apps.filter((app) => app.installed)
  const canStart = Boolean(goal.trim() && store.accessibilityEnabled && selectedApp?.installed && !activeAction)
  const remainingSeconds = store.task.deadlineAt ? Math.max(0, Math.ceil((store.task.deadlineAt - now) / 1000)) : undefined
  const taskStatus = taskPresentation[store.task.state]
  const petState = petStateForTask(store.task, Boolean(approvalRequest))
  const petStateLabel: Record<string, string> = {
    idle: '空闲',
    thinking: '思考中',
    executing: '正在执行',
    success: '任务完成',
    error: '遇到问题',
    waitingApproval: '等待你的批准',
  }

  const runTaskAction = async (name: ActionName, action: () => Promise<unknown>) => {
    setTaskError('')
    setActiveAction(name)
    try { await action() } catch (error) { setTaskError(friendlyError(error)) } finally { setActiveAction(undefined) }
  }

  const runOverlayAction = async (action: () => Promise<{ permissionGranted: boolean; running: boolean }>) => {
    setPetError('')
    setOverlayBusy(true)
    try {
      const status = await action()
      setOverlayPermission(status.permissionGranted)
      setOverlayRunning(status.running)
    } catch (error) {
      setPetError(friendlyError(error))
    } finally {
      setOverlayBusy(false)
    }
  }

  return (
    <Page title="蒜宝助手">
      <Box maw={720} mx="auto" p="md" w="100%">
        <Tabs value={tab} onChange={(value) => value && setTab(value as TabName)} keepMounted>
          <Tabs.List grow mb="md">
            <Tabs.Tab value="pet" leftSection={<IconSparkles size={18} />}>桌宠</Tabs.Tab>
            <Tabs.Tab value="assistant" leftSection={<IconDeviceMobile size={18} />}>手机助手</Tabs.Tab>
            <Tabs.Tab value="settings" leftSection={<IconSettings size={18} />}>设置</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="pet"><PetPanel
            taskState={store.task.state}
            overlayPermission={overlayPermission}
            overlayRunning={overlayRunning}
            overlayLifecycle={overlayLifecycle}
            overlayBusy={overlayBusy}
            error={petError}
            petPosition={petPosition}
            petDrag={petDrag}
            setPetPosition={setPetPosition}
            onGrant={() => { setOverlayBusy(true); setPetError(''); void androidAgentNative.openOverlaySettings().catch((error) => setPetError(friendlyError(error))).finally(() => setOverlayBusy(false)) }}
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
          /></Tabs.Panel>

          <Tabs.Panel value="assistant"><AssistantPanel
            store={store}
            appId={appId}
            setAppId={setAppId}
            goal={goal}
            setGoal={setGoal}
            remainingSeconds={remainingSeconds}
            taskStatus={taskStatus}
            taskError={taskError}
            activeAction={activeAction}
            canStart={canStart}
            installedApps={installedApps.length}
            onOpenAccessibility={() => void androidAgentNative.openAccessibilitySettings()}
            onStart={() => void runTaskAction('start', () => store.start(appId, goal, budget, durationMinutes * 60_000))}
            onPause={() => void runTaskAction('pause', store.pause)}
            onResume={() => void runTaskAction('resume', store.resume)}
            onStop={() => void runTaskAction('stop', store.stop)}
            onRefresh={() => void runTaskAction('refresh', store.refresh)}
          /></Tabs.Panel>

          <Tabs.Panel value="settings"><SettingsPanel
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
          /></Tabs.Panel>
        </Tabs>
      </Box>
    </Page>
  )
}

function PermissionCard({ complete, title, description, action }: { complete: boolean; title: string; description: string; action?: React.ReactNode }) {
  return <Card withBorder padding="md" radius="md"><Group align="flex-start" wrap="nowrap"><ThemeIcon color={complete ? 'green' : 'blue'} variant="light" radius="xl">{complete ? <IconCheck size={18} /> : <IconShieldCheck size={18} />}</ThemeIcon><Stack gap={4} style={{ flex: 1 }}><Group justify="space-between" align="flex-start"><Box><Text fw={600}>{title}</Text><Text size="sm" c="dimmed">{description}</Text></Box><Badge color={complete ? 'green' : 'yellow'} variant="light">{complete ? '已完成' : '待设置'}</Badge></Group>{action}</Stack></Group></Card>
}

function PetAppearanceCard(props: any) {
  return <Card withBorder radius="lg" padding="md"><Stack gap="md"><Box><Text fw={600}>快捷外观</Text><Text size="sm" c="dimmed">设置会立即同步到系统悬浮桌宠。</Text></Box><Box><Text size="sm" mb={6}>桌宠大小</Text><SegmentedControl fullWidth value={props.petSize} onChange={(size) => props.onAppearanceChange({ size })} data={[{ label: '小', value: 'small' }, { label: '中', value: 'medium' }, { label: '大', value: 'large' }]} /></Box><Box><Group justify="space-between"><Text size="sm">透明度</Text><Text size="sm" c="dimmed">{Math.round(props.petOpacity * 100)}%</Text></Group><Slider min={50} max={100} step={5} value={Math.round(props.petOpacity * 100)} onChangeEnd={(value) => props.onAppearanceChange({ opacity: value / 100 })} /></Box><Box><Text size="sm" mb={6}>动画</Text><SegmentedControl fullWidth value={props.petMotion} onChange={(motion) => props.onAppearanceChange({ motion })} data={[{ label: '完整', value: 'full' }, { label: '减少', value: 'reduced' }, { label: '关闭', value: 'off' }]} /></Box><Switch label="松手后自动吸附屏幕边缘" description="关闭后可以停留在屏幕安全区域内的任意位置" checked={props.edgeSnap} onChange={(event) => props.onAppearanceChange({ edgeSnap: event.currentTarget.checked })} /><Switch label="锁定当前位置，防止误触拖动" description="锁定后单击仍可打开快捷菜单" checked={props.positionLocked} onChange={(event) => props.onAppearanceChange({ positionLocked: event.currentTarget.checked })} /></Stack></Card>
}

function PetPanel(props: any) {
  return <Stack>
    <Card withBorder padding="lg" radius="lg" style={{ background: 'rgba(225, 245, 224, 0.38)' }}>
      <Stack align="center" gap="sm">
        <Box
          style={{ transform: `translate(${props.petPosition.x}px, ${props.petPosition.y}px)`, touchAction: 'none', cursor: 'grab' }}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); props.petDrag.current = { x: props.petPosition.x, y: props.petPosition.y, pointerX: event.clientX, pointerY: event.clientY } }}
          onPointerMove={(event) => { if (props.petDrag.current) props.setPetPosition({ x: props.petDrag.current.x + event.clientX - props.petDrag.current.pointerX, y: props.petDrag.current.y + event.clientY - props.petDrag.current.pointerY }) }}
          onPointerUp={() => { props.petDrag.current = undefined }} onPointerCancel={() => { props.petDrag.current = undefined }}
        ><SuanbaoMascot state={props.petState.state === 'executing' || props.petState.state === 'thinking' ? 'executing' : props.petState.state === 'error' ? 'error' : props.petState.state === 'success' ? 'success' : 'idle'} animation="full" /></Box>
        <Group gap={6}><Title order={3}>你好，我是蒜宝</Title><Badge color={props.petState.state === 'waitingApproval' ? 'yellow' : props.petState.state === 'error' ? 'red' : props.petState.state === 'executing' ? 'green' : 'gray'}>{props.petStateLabel[props.petState.state]}</Badge></Group>
        {props.petState.message && <Text size="sm" ta="center" c={props.petState.state === 'error' ? 'red' : 'dimmed'}>{props.petState.message}</Text>}
        <Text size="sm" c="dimmed" ta="center">在 KOD 里拖动我，或开启系统悬浮桌宠，让我陪你使用其他应用。</Text>
      </Stack>
    </Card>
    {props.error && <Alert color="red" title="桌宠操作失败">{props.error}</Alert>}
    <PermissionCard complete={props.overlayPermission} title="第 1 步 · 允许悬浮显示" description="用于把蒜宝显示在其他应用上方；你可以随时在系统设置中撤销。" action={!props.overlayPermission ? <Button mt="xs" loading={props.overlayBusy} onClick={props.onGrant}>前往系统设置</Button> : undefined} />
    <PermissionCard complete={props.overlayRunning} title="第 2 步 · 开启系统桌宠" description={props.overlayLifecycle === 'starting' ? '系统正在启动悬浮桌宠…' : props.overlayRunning ? '蒜宝正在其他应用上方显示。' : '授权后由你主动开启，不会在后台偷偷启动。'} action={props.overlayPermission ? <Button mt="xs" color={props.overlayRunning ? 'red' : 'blue'} variant={props.overlayRunning ? 'light' : 'filled'} loading={props.overlayBusy || props.overlayLifecycle === 'starting'} onClick={props.overlayRunning ? props.onStop : props.onStart}>{props.overlayRunning ? '关闭桌宠' : '开启桌宠'}</Button> : undefined} />
    <PetAppearanceCard {...props} />
  </Stack>
}

function AssistantPanel(props: any) {
  const task = props.store.task
  return <Stack>
    <Group justify="space-between"><Box><Title order={3}>手机任务控制</Title><Text size="sm" c="dimmed">仅支持微信和 QQ，所有写操作都需要你的单次批准。</Text></Box><Badge color={props.taskStatus.color} size="lg">{props.taskStatus.label}</Badge></Group>
    {!props.store.accessibilityEnabled && <PermissionCard complete={false} title="开启 KOD 手机控制服务" description="用于读取目标应用界面并执行你批准的操作；支付、密码和验证码始终禁止。" action={<Button mt="xs" onClick={props.onOpenAccessibility}>前往无障碍设置</Button>} />}
    {props.store.accessibilityEnabled && <PermissionCard complete title="KOD 手机控制服务已开启" description="你可以随时从 Android 无障碍设置中关闭。" />}
    {props.installedApps === 0 && <Alert color="yellow" title="未找到支持的应用">请先安装微信或 QQ，再返回此页面刷新状态。</Alert>}
    {props.taskError && <Alert color="red" title="任务操作失败">{props.taskError}</Alert>}
    <Card withBorder radius="md" padding="md"><Stack>
      <Select label="目标应用" value={props.appId} onChange={(value) => value && props.setAppId(value)} data={props.store.apps.map((app: any) => ({ value: app.id, label: `${app.id === 'wechat' ? '微信' : 'QQ'}${app.installed ? '' : '（未安装）'}`, disabled: !app.installed }))} />
      <Textarea label="任务目标" placeholder="例如：打开与张三的聊天并找到最近一条消息" value={props.goal} onChange={(event) => props.setGoal(event.currentTarget.value)} maxLength={500} minRows={3} />
      {!props.canStart && props.goal.trim() && <Text size="xs" c="dimmed">请先完成无障碍设置，并选择已安装的目标应用。</Text>}
      {task.taskId && <Card withBorder padding="sm" radius="md"><Stack gap={4}><Text fw={600}>当前任务</Text><Text size="sm">剩余时间：{props.remainingSeconds ?? '-'} 秒</Text><Text size="sm">剩余操作：{task.remainingBudget ?? '-'} / {task.budget ?? '-'}</Text>{task.terminalReason && <Text size="sm" c={task.state === 'failed' ? 'red' : 'dimmed'}>{terminalReasonText[task.terminalReason] || task.terminalReason}</Text>}<Text size="xs" c="dimmed">诊断信息：g{task.generation ?? '-'} · 协议 {task.protocolVersion ?? '-'}</Text></Stack></Card>}
      <Group>
        {(['idle', 'stopped', 'failed'].includes(task.state)) && <Button disabled={!props.canStart} loading={props.activeAction === 'start'} onClick={props.onStart}>开始任务</Button>}
        {task.state === 'running' && <Button variant="light" loading={props.activeAction === 'pause'} onClick={props.onPause}>暂停</Button>}
        {task.state === 'paused' && <Button loading={props.activeAction === 'resume'} onClick={props.onResume}>继续</Button>}
        {(['running', 'paused'].includes(task.state)) && <Button color="red" variant="light" loading={props.activeAction === 'stop'} onClick={props.onStop}>停止</Button>}
        <Button variant="subtle" loading={props.activeAction === 'refresh'} disabled={Boolean(props.activeAction)} onClick={props.onRefresh}>刷新状态</Button>
      </Group>
    </Stack></Card>
  </Stack>
}

function SettingsPanel(props: any) {
  const fileAction = (action: () => Promise<void>) => { props.setFileError(''); props.setFileBusy(true); void action().catch((error) => props.setFileError(friendlyError(error))).finally(() => props.setFileBusy(false)) }
  return <Stack>
    <Card withBorder radius="md" padding="md"><Stack><Title order={4}>任务限制</Title><Text size="sm" c="dimmed">更低的预算和时限可以减少误操作风险。</Text><Group grow><NumberInput label="操作预算" min={1} max={100} value={props.budget} onChange={(value) => props.setBudget(Number(value) || 1)} /><NumberInput label="时限（分钟）" min={1} max={15} value={props.durationMinutes} onChange={(value) => props.setDurationMinutes(Number(value) || 1)} /></Group></Stack></Card>
    <PetAppearanceCard {...props} />
    <Alert color="blue" title="安全边界">仅支持微信和 QQ；每个写操作都需要批准，支付、转账、密码、验证码和凭证字段始终阻断。</Alert>
    {isMobileFilePickerAvailable() && <Card withBorder radius="md" padding="md"><Stack gap="xs"><Title order={4}>手机文件</Title><Text size="sm" c="dimmed">选择图片、PDF 或文本文件；文件不会自动上传。</Text>{props.fileError && <Alert color="red">{props.fileError}</Alert>}<Group><Button size="sm" loading={props.fileBusy} onClick={() => fileAction(async () => { const result = await mobileFileNative.pickFile('image'); if (!result.cancelled) props.setMobileFile(result.files[0]) })}>选择照片</Button><Button size="sm" variant="light" loading={props.fileBusy} onClick={() => fileAction(async () => { const result = await mobileFileNative.pickFile('document'); if (!result.cancelled) props.setMobileFile(result.files[0]) })}>选择文档</Button>{props.mobileFile && <Button size="sm" variant="light" loading={props.fileBusy} onClick={() => fileAction(() => mobileFileNative.shareFile(props.mobileFile.token).then(() => undefined))}>分享</Button>}{props.mobileFile && <Button size="sm" color="red" variant="light" loading={props.fileBusy} onClick={() => fileAction(() => mobileFileNative.revokeFile(props.mobileFile.token).then(() => props.setMobileFile(undefined)))}>撤销</Button>}</Group>{props.mobileFile && <Text size="xs" truncate>{props.mobileFile.name} · {props.mobileFile.mimeType} · {Math.ceil(props.mobileFile.size / 1024)} KiB</Text>}</Stack></Card>}
  </Stack>
}
