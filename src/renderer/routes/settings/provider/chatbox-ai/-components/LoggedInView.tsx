import { Alert, Button, Checkbox, Flex, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconExternalLink, IconLogout, IconTrash } from '@tabler/icons-react'
import { forwardRef, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { Modal } from '@/components/layout/Overlay'
import platform from '@/platform'
import { AccountDeletedWithCleanupError, canDeleteAccount } from './accountDeletion'

interface LoggedInViewProps {
  onLogout: () => void
  onDeleteAccount: (password: string) => Promise<void>
}

export const LoggedInView = forwardRef<HTMLDivElement, LoggedInViewProps>(({ onLogout, onDeleteAccount }, ref) => {
  const [opened, setOpened] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetAndClose = useCallback(() => {
    setOpened(false)
    setPassword('')
    setConfirmation('')
    setAcknowledged(false)
    setError(null)
  }, [])
  const close = useCallback(() => {
    if (submitting) return
    resetAndClose()
  }, [resetAndClose, submitting])
  const submit = useCallback(async () => {
    if (submitting || !canDeleteAccount(password, confirmation, acknowledged)) return
    setSubmitting(true)
    setError(null)
    try {
      await onDeleteAccount(password)
      resetAndClose()
    } catch (cause) {
      if (cause instanceof AccountDeletedWithCleanupError) {
        resetAndClose()
        toast.warning(cause.message)
        return
      }
      setError('账号删除失败，请确认当前密码是否正确，然后重试。')
    } finally {
      setSubmitting(false)
    }
  }, [acknowledged, confirmation, onDeleteAccount, password, resetAndClose, submitting])

  return (
    <Stack gap="xl" ref={ref}>
      <Flex gap="xs" align="center" justify="space-between">
        <Title order={3} c="chatbox-secondary">
          KOD
        </Title>
        <Button
          variant="transparent"
          c="chatbox-tertiary"
          px={0}
          h={24}
          onClick={() => platform.openLink('https://kod.kai.com')}
        >
          <ScalableIcon icon={IconExternalLink} size={24} />
        </Button>
      </Flex>
      <Paper shadow="xs" p="md" withBorder>
        <Stack gap="sm">
          <Text fw={600}>已登录 KOD</Text>
          <Text c="chatbox-tertiary">KOD 将使用当前账号关联的中转站地址和 API 密钥获取可用模型。</Text>
          <Flex justify="flex-end">
            <Button
              variant="light"
              color="chatbox-gray"
              leftSection={<ScalableIcon icon={IconLogout} size={14} />}
              onClick={() => void onLogout()}
            >
              退出登录
            </Button>
          </Flex>
        </Stack>
      </Paper>
      <Paper shadow="xs" p="md" withBorder style={{ borderColor: 'var(--mantine-color-red-5)' }}>
        <Stack gap="sm">
          <Text fw={600} c="red">
            危险操作
          </Text>
          <Text size="sm" c="chatbox-tertiary">
            永久删除 KOD
            账号及其云端数据，并清除该账号在本设备上的本地对话、任务、生成图片、蒜宝数据、偏好设置、凭据和缓存。独立模型提供方的
            OAuth 授权信息将被保留。
          </Text>
          <Flex justify="flex-end">
            <Button
              color="red"
              variant="light"
              leftSection={<ScalableIcon icon={IconTrash} size={14} />}
              onClick={() => setOpened(true)}
            >
              删除账号
            </Button>
          </Flex>
        </Stack>
      </Paper>
      <Modal
        opened={opened}
        onClose={close}
        centered
        title="永久删除 KOD 账号"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        withCloseButton={!submitting}
      >
        <Stack gap="md">
          <Alert color="red" variant="light" title="此操作无法撤销">
            KOD
            账号及云端数据将被永久删除。本地对话、任务记录、生成图片记录与文件、蒜宝数据、账号偏好设置、中转站与模型提供方数据、缓存和登录令牌也会被清除。如果服务器删除失败，账号将保持登录状态，本地数据不会被删除。
          </Alert>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <PasswordInput
            label="当前密码"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete="current-password"
            disabled={submitting}
          />
          <TextInput
            label="输入“确认删除”以继续"
            description="请完整输入以下确认文字：确认删除"
            value={confirmation}
            onChange={(e) => setConfirmation(e.currentTarget.value)}
            disabled={submitting}
          />
          <Checkbox
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.currentTarget.checked)}
            disabled={submitting}
            label="我已了解此操作会永久删除我的账号和数据。"
          />
          <Flex justify="flex-end" gap="sm">
            <Button variant="light" color="chatbox-gray" onClick={close} disabled={submitting}>
              取消
            </Button>
            <Button
              color="red"
              loading={submitting}
              disabled={!canDeleteAccount(password, confirmation, acknowledged)}
              onClick={() => void submit()}
            >
              永久删除账号
            </Button>
          </Flex>
        </Stack>
      </Modal>
    </Stack>
  )
})
LoggedInView.displayName = 'LoggedInView'
