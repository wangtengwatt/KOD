import { Alert, Badge, Box, Button, Card, Center, Group, NumberInput, Select, Stack, Text, Textarea, Title } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { SuanbaoMascot } from '@/components/suanbao/SuanbaoMascot'
import '@/components/suanbao/suanbao.css'
import Page from '@/components/layout/Page'
import { useAndroidAgentStore } from '@/packages/android-agent/controller'
import { isMobileFilePickerAvailable, mobileFileNative } from '@/packages/android-agent/file-native'
import type { MobileFile } from '@/packages/android-agent/file-types'
import { androidAgentNative, isAndroidAgentAvailable } from '@/packages/android-agent/native'
import type { AndroidAgentAppId } from '@/packages/android-agent/types'

export const Route = createFileRoute('/android-agent/')({ component: AndroidAgentPage })

function AndroidAgentPage() {
  const store = useAndroidAgentStore()
  const [appId, setAppId] = useState<AndroidAgentAppId>('wechat')
  const [goal, setGoal] = useState('')
  const [budget, setBudget] = useState(30)
  const [durationMinutes, setDurationMinutes] = useState(5)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [mobileFile, setMobileFile] = useState<MobileFile>()
  const [fileBusy, setFileBusy] = useState(false)
  const [overlayPermission, setOverlayPermission] = useState(false)
  const [overlayRunning, setOverlayRunning] = useState(false)
  const [overlayBusy, setOverlayBusy] = useState(false)
  const [petPosition, setPetPosition] = useState({ x: 0, y: 0 })
  const petDrag = useRef<{ x: number; y: number; pointerX: number; pointerY: number }>()

  const refreshOverlay = async () => {
    const status = await androidAgentNative.getOverlayStatus()
    setOverlayPermission(status.permissionGranted)
    setOverlayRunning(status.running)
  }

  useEffect(() => {
    if (isAndroidAgentAvailable()) {
      void store.refresh().catch((err) => setError(String(err)))
      void refreshOverlay().catch((err) => setError(String(err)))
    }
  }, [store.refresh])

  useEffect(() => {
    const onResume = () => void refreshOverlay().catch((err) => setError(String(err)))
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
    }
  }, [])

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
      <Page title="Android Agent">
        <Center h="100%">
          <Alert color="yellow">Android Agent 仅在 Android 应用中可用。</Alert>
        </Center>
      </Page>
    )
  }

  const remainingSeconds = store.task.deadlineAt ? Math.max(0, Math.ceil((store.task.deadlineAt - now) / 1000)) : undefined

  const run = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Page title="Android Agent">
      <Center h="100%" p="md">
        <Card withBorder maw={560} w="100%" padding="lg">
          <Stack>
            <Card withBorder padding="sm">
              <Stack gap="xs">
                <Group align="center" wrap="nowrap">
                  <Box
                    style={{ transform: `translate(${petPosition.x}px, ${petPosition.y}px)`, touchAction: 'none', cursor: 'grab' }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId)
                      petDrag.current = { x: petPosition.x, y: petPosition.y, pointerX: event.clientX, pointerY: event.clientY }
                    }}
                    onPointerMove={(event) => {
                      if (!petDrag.current) return
                      setPetPosition({
                        x: petDrag.current.x + event.clientX - petDrag.current.pointerX,
                        y: petDrag.current.y + event.clientY - petDrag.current.pointerY,
                      })
                    }}
                    onPointerUp={() => { petDrag.current = undefined }}
                    onPointerCancel={() => { petDrag.current = undefined }}
                  >
                    <SuanbaoMascot state={store.task.state === 'running' ? 'executing' : 'idle'} animation="full" />
                  </Box>
                  <Stack gap={2} style={{ flex: 1 }}>
                    <Text fw={600}>蒜宝助手</Text>
                    <Text size="xs" c="dimmed">按住蒜宝可以在 KOD 页面内拖动；系统悬浮桌宠可显示在其他应用上方。</Text>
                  </Stack>
                </Group>
                <Group justify="space-between">
                  <Stack gap={0}>
                    <Text size="sm" fw={500}>系统悬浮桌宠</Text>
                    <Text size="xs" c="dimmed">
                      {overlayPermission ? (overlayRunning ? '蒜宝正在其他应用上方显示' : '权限已授予，当前未开启') : '需要授予“显示在其他应用上层”权限'}
                    </Text>
                  </Stack>
                  {!overlayPermission ? (
                    <Button size="xs" loading={overlayBusy} onClick={() => {
                      setOverlayBusy(true)
                      void androidAgentNative.openOverlaySettings().catch((err) => setError(String(err))).finally(() => setOverlayBusy(false))
                    }}>授予权限</Button>
                  ) : overlayRunning ? (
                    <Button size="xs" color="red" variant="light" loading={overlayBusy} onClick={() => {
                      setOverlayBusy(true)
                      void androidAgentNative.stopOverlayPet().then((status) => setOverlayRunning(status.running)).catch((err) => setError(String(err))).finally(() => setOverlayBusy(false))
                    }}>关闭桌宠</Button>
                  ) : (
                    <Button size="xs" loading={overlayBusy} onClick={() => {
                      setOverlayBusy(true)
                      void androidAgentNative.startOverlayPet().then((status) => setOverlayRunning(status.running)).catch((err) => setError(String(err))).finally(() => setOverlayBusy(false))
                    }}>开启桌宠</Button>
                  )}
                </Group>
              </Stack>
            </Card>
            <Group justify="space-between">
              <Title order={3}>手机任务控制</Title>
              <Badge color={store.task.state === 'running' ? 'green' : 'gray'}>{store.task.state}</Badge>
            </Group>
            <Alert color="blue">仅支持微信和 QQ；每个写操作都需审批，支付、凭证及密码字段始终阻断。</Alert>
            {!store.accessibilityEnabled && (
              <Button variant="light" onClick={() => void androidAgentNative.openAccessibilitySettings()}>
                开启无障碍服务
              </Button>
            )}
            <Select
              label="目标应用"
              value={appId}
              onChange={(value) => value && setAppId(value as AndroidAgentAppId)}
              data={store.apps.map((app) => ({ value: app.id, label: `${app.id} ${app.installed ? '' : '(未安装)'}` }))}
            />
            <Textarea
              label="任务目标"
              value={goal}
              onChange={(event) => setGoal(event.currentTarget.value)}
              maxLength={500}
            />
            <Group grow>
              <NumberInput label="操作预算" min={1} max={100} value={budget} onChange={(value) => setBudget(Number(value) || 1)} />
              <NumberInput label="时限（分钟）" min={1} max={15} value={durationMinutes} onChange={(value) => setDurationMinutes(Number(value) || 1)} />
            </Group>
            {store.task.taskId && (
              <Stack gap={2}>
                <Text size="sm">剩余时间：{remainingSeconds ?? '-'} 秒</Text>
                <Text size="sm">剩余预算：{store.task.remainingBudget ?? '-'} / {store.task.budget ?? '-'}</Text>
                <Text size="sm">停止原因：{store.task.terminalReason || '-'}</Text>
                <Text size="xs" c="dimmed">任务版本：g{store.task.generation ?? '-'} · 协议 {store.task.protocolVersion ?? '-'}</Text>
              </Stack>
            )}
            {error && (
              <Text c="red" size="sm">
                {error}
              </Text>
            )}
            {isMobileFilePickerAvailable() && (
              <Card withBorder padding="sm">
                <Stack gap="xs">
                  <Text fw={600}>手机文件</Text>
                  <Text size="xs" c="dimmed">选择一个图片、PDF 或文本文件；不会自动上传。</Text>
                  <Group>
                    <Button size="xs" loading={fileBusy} onClick={() => { setFileBusy(true); void mobileFileNative.pickFile('image').then((result) => { if (!result.cancelled) setMobileFile(result.files[0]) }).catch((err) => setError(String(err))).finally(() => setFileBusy(false)) }}>选择照片</Button>
                    <Button size="xs" variant="light" loading={fileBusy} onClick={() => { setFileBusy(true); void mobileFileNative.pickFile('document').then((result) => { if (!result.cancelled) setMobileFile(result.files[0]) }).catch((err) => setError(String(err))).finally(() => setFileBusy(false)) }}>选择文档</Button>
                    {mobileFile && <Button size="xs" loading={fileBusy} onClick={() => { setFileBusy(true); void mobileFileNative.shareFile(mobileFile.token).catch((err) => setError(String(err))).finally(() => setFileBusy(false)) }}>分享</Button>}
                    {mobileFile && <Button size="xs" color="red" variant="light" loading={fileBusy} onClick={() => { setFileBusy(true); void mobileFileNative.revokeFile(mobileFile.token).then(() => setMobileFile(undefined)).catch((err) => setError(String(err))).finally(() => setFileBusy(false)) }}>撤销</Button>}
                  </Group>
                  {mobileFile && <Text size="xs" truncate>{mobileFile.name} · {mobileFile.mimeType} · {Math.ceil(mobileFile.size / 1024)} KiB</Text>}
                </Stack>
              </Card>
            )}
            <Group>
              {(store.task.state === 'idle' || store.task.state === 'stopped' || store.task.state === 'failed') && (
                <Button disabled={!goal.trim()} onClick={() => void run(() => store.start(appId, goal, budget, durationMinutes * 60_000))}>
                  开始
                </Button>
              )}
              {store.task.state === 'running' && (
                <Button variant="light" onClick={() => void run(store.pause)}>
                  暂停
                </Button>
              )}
              {store.task.state === 'paused' && <Button onClick={() => void run(store.resume)}>继续</Button>}
              {(store.task.state === 'running' || store.task.state === 'paused') && (
                <Button color="red" variant="light" onClick={() => void run(store.stop)}>
                  停止
                </Button>
              )}
              <Button variant="subtle" onClick={() => void run(store.refresh)}>
                刷新状态
              </Button>
            </Group>
          </Stack>
        </Card>
      </Center>
    </Page>
  )
}
