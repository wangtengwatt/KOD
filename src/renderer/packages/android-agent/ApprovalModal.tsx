import { Alert, Box, Button, Card, Group, Modal, Progress, Stack, Text } from '@mantine/core'
import { IconArrowBack, IconChevronDown, IconKeyboard, IconMouse } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAndroidAgentApprovalStore } from './approval-store'
import type { AndroidAgentApprovalRequest } from './types'

const actionLabel: Record<
  AndroidAgentApprovalRequest['actionType'],
  { labelKey: string; icon: React.ReactNode; warning: boolean }
> = {
  click: { labelKey: 'Click', icon: <IconMouse size={18} />, warning: false },
  input: { labelKey: 'Type text', icon: <IconKeyboard size={18} />, warning: true },
  scroll: { labelKey: 'Scroll page', icon: <IconChevronDown size={18} />, warning: false },
  back: { labelKey: 'Go back', icon: <IconArrowBack size={18} />, warning: false },
}

export default function AndroidAgentApprovalModal() {
  const { t } = useTranslation()
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
    <Modal
      opened={!!request}
      onClose={() => decide(false)}
      title={t('Approve phone operation')}
      centered
      closeOnClickOutside={false}
    >
      {request && meta && (
        <Stack>
          <Card
            withBorder
            radius="md"
            padding="md"
            bg={meta.warning ? 'rgba(255, 249, 231, 0.55)' : 'rgba(231, 245, 255, 0.5)'}
          >
            <Group align="center" wrap="nowrap">
              <Alert color={meta.warning ? 'yellow' : 'blue'} p={8} radius="md" style={{ flexShrink: 0 }}>
                {meta.icon}
              </Alert>
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  {t('Target action')} · {t(meta.labelKey)}
                </Text>
                <Text fw={600}>{request.summary}</Text>
              </Stack>
            </Group>
          </Card>
          <Box>
            <Group justify="space-between" mb={6}>
              <Text size="sm" c="dimmed">
                {t('Approval validity')}
              </Text>
              <Text size="sm" fw={600} c={remainingSeconds <= 5 ? 'red' : undefined}>
                {remainingSeconds} {t('seconds')}
              </Text>
            </Group>
            <Progress value={countdownValue} color={remainingSeconds <= 5 ? 'red' : 'blue'} size="sm" radius="xl" />
          </Box>
          <Text size="xs" c="dimmed">
            {t(
              'Each operation is approved only once. Please confirm that the current target app and screen match your expectations.'
            )}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" autoFocus onClick={() => decide(false)}>
              {t('Reject')}
            </Button>
            <Button onClick={() => decide(true)}>{t('Approve once')}</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
