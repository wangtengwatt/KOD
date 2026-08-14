import { Alert, Box, Button, Card, Group, Modal, Progress, Stack, Text } from '@mantine/core'
import { IconArrowBack, IconKeyboard, IconMouse, IconChevronDown } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useAndroidAgentApprovalStore } from './approval-store'
import type { AndroidAgentApprovalRequest } from './types'

const actionLabel: Record<AndroidAgentApprovalRequest['actionType'], { label: string; icon: React.ReactNode; warning: boolean }> = {
  click: { label: '点击', icon: <IconMouse size={18} />, warning: false },
  input: { label: '输入文字', icon: <IconKeyboard size={18} />, warning: true },
  scroll: { label: '滚动页面', icon: <IconChevronDown size={18} />, warning: false },
  back: { label: '返回上一步', icon: <IconArrowBack size={18} />, warning: false },
}

export default function AndroidAgentApprovalModal() {
  const request = useAndroidAgentApprovalStore((state) => state.request)
  const decide = useAndroidAgentApprovalStore((state) => state.decide)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!request) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [request])
  const remainingMs = request ? Math.max(0, request.expiresAt - now) : 0
  const remainingSeconds = Math.ceil(remainingMs / 1000)
  const totalMs = request ? Math.max(1, request.expiresAt - request.requestedAt) : 1
  const countdownValue = request ? Math.round((remainingMs / totalMs) * 100) : 0
  const meta = request ? actionLabel[request.actionType] : null

  return (
    <Modal opened={!!request} onClose={() => decide(false)} title="批准手机操作" centered closeOnClickOutside={false}>
      {request && meta && (
        <Stack>
          <Card withBorder radius="md" padding="md" bg={meta.warning ? 'rgba(255, 249, 231, 0.55)' : 'rgba(231, 245, 255, 0.5)'}>
            <Group align="center" wrap="nowrap">
              <Alert color={meta.warning ? 'yellow' : 'blue'} p={8} radius="md" style={{ flexShrink: 0 }}>
                {meta.icon}
              </Alert>
              <Stack gap={2}>
                <Text size="xs" c="dimmed">目标操作 · {meta.label}</Text>
                <Text fw={600}>{request.summary}</Text>
              </Stack>
            </Group>
          </Card>
          <Box>
            <Group justify="space-between" mb={6}>
              <Text size="sm" c="dimmed">批准有效期</Text>
              <Text size="sm" fw={600} c={remainingSeconds <= 5 ? 'red' : undefined}>{remainingSeconds} 秒</Text>
            </Group>
            <Progress value={countdownValue} color={remainingSeconds <= 5 ? 'red' : 'blue'} size="sm" radius="xl" />
          </Box>
          <Text size="xs" c="dimmed">
            每次操作只批准一次。请确认当前目标应用和界面符合你的预期。
          </Text>
          <Group justify="flex-end">
            <Button variant="default" autoFocus onClick={() => decide(false)}>
              拒绝
            </Button>
            <Button onClick={() => decide(true)}>批准一次</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
