import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useAndroidAgentApprovalStore } from './approval-store'

export default function AndroidAgentApprovalModal() {
  const request = useAndroidAgentApprovalStore((state) => state.request)
  const decide = useAndroidAgentApprovalStore((state) => state.decide)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!request) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [request])
  const remainingSeconds = request ? Math.max(0, Math.ceil((request.expiresAt - now) / 1000)) : 0

  return (
    <Modal opened={!!request} onClose={() => decide(false)} title="批准手机操作" centered closeOnClickOutside={false}>
      <Stack>
        <Text>{request?.summary}</Text>
        <Text size="xs" c="dimmed">
          每次操作只批准一次。请确认当前目标应用和界面符合你的预期。批准将在 {remainingSeconds} 秒后失效。
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => decide(false)}>
            拒绝
          </Button>
          <Button onClick={() => decide(true)}>批准一次</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
