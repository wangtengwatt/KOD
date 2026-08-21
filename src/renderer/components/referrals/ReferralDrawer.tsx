import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Divider,
  Drawer,
  Flex,
  Group,
  Modal,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { IconArrowLeft, IconCheck, IconCopy, IconMailPlus, IconUsersPlus } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { computeKeys, getWalletIdentity, invalidateRewardReceipt } from '@/hooks/useWallet'
import {
  createEmailInvitation,
  type EmailInvitation,
  getComputeReferralProfile,
  listComputeNotifications,
  listEmailInvitations,
  markComputeNotificationRead,
} from '@/packages/computeCenter'
import { getKodApiOrigin } from '@/packages/kodApiOrigin'
import { copyToClipboard } from '@/packages/navigator'
import { useAuthInfoStore } from '@/stores/authInfoStore'
import { ScalableIcon } from '../common/ScalableIcon'

const TRACKING_DAYS = 90
const GENERIC_CONFIRMATION = '邀请请求已记录'
const REWARD_NOTIFICATION_TYPE = 'REFERRAL_REGISTRATION_REWARDED'

type DrawerView = 'invite' | 'tracking'

const invitationStatus = {
  PENDING: { label: '待处理', color: 'gray' },
  ACCEPTED: { label: '已接受', color: 'green' },
  FAILED: { label: '失败', color: 'red' },
  EXPIRED: { label: '已失效', color: 'red' },
} as const

function isValidEmail(value: string) {
  return value.length <= 128 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function emailInitial(email: string) {
  return email.trim().charAt(0).toLocaleUpperCase() || '?'
}

function formatLocalDateTime(value: string | null) {
  if (!value) return ''
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  return match ? `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}` : ''
}

function registrationUrl(value: string) {
  return new URL(value, getKodApiOrigin()).toString()
}

function safeFailureReason(invitation: EmailInvitation) {
  if (invitation.status === 'EXPIRED') return '邀请已过期'
  const reason = invitation.failureReason.toLocaleLowerCase()
  if (reason.includes('another inviter') || reason.includes('其他邀请人')) return '该账号已绑定其他邀请人'
  if (reason.includes('self') || reason.includes('自己')) return '不能邀请自己'
  if (reason.includes('registered') || reason.includes('已注册')) return '该邮箱已注册'
  return '邀请未能完成'
}

export default function ReferralDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const refreshToken = useAuthInfoStore((state) => state.refreshToken)
  const loginEmail = useAuthInfoStore((state) => state.loginEmail)
  const isLoggedIn = Boolean(accessToken)
  const walletIdentity = getWalletIdentity(loginEmail, accessToken, refreshToken)
  const queryIdentity = walletIdentity ?? 'signed-out'
  const [view, setView] = useState<DrawerView>('invite')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [rewardReceipt, setRewardReceipt] = useState('')
  const shownRewardNotification = useRef<number | null>(null)

  const profileQuery = useQuery({
    queryKey: computeKeys.referralProfile(queryIdentity),
    queryFn: getComputeReferralProfile,
    enabled: opened && isLoggedIn,
  })
  const trackingQuery = useQuery({
    queryKey: computeKeys.emailInvites(queryIdentity, TRACKING_DAYS),
    queryFn: () => listEmailInvitations(TRACKING_DAYS),
    enabled: opened && isLoggedIn && view === 'tracking',
  })
  const notificationsQuery = useQuery({
    queryKey: computeKeys.notifications(queryIdentity),
    queryFn: listComputeNotifications,
    enabled: isLoggedIn,
    refetchInterval: isLoggedIn ? 5000 : false,
  })
  const createMutation = useMutation({
    mutationFn: createEmailInvitation,
    onSuccess: () => {
      setEmail('')
      setEmailError('')
      setConfirmation(GENERIC_CONFIRMATION)
    },
    onError: () => {
      setConfirmation('暂时无法记录邀请，请稍后重试')
    },
  })

  useEffect(() => {
    const reward = notificationsQuery.data?.find(
      (notification) =>
        notification.notificationType === REWARD_NOTIFICATION_TYPE &&
        notification.isRead === 0 &&
        notification.id !== shownRewardNotification.current
    )
    if (!reward) return
    shownRewardNotification.current = reward.id
    setRewardReceipt(reward.content)
    void Promise.allSettled([
      walletIdentity
        ? invalidateRewardReceipt(queryClient, walletIdentity)
        : queryClient.invalidateQueries({ queryKey: computeKeys.account(queryIdentity) }),
      markComputeNotificationRead(reward.id).finally(() =>
        queryClient.invalidateQueries({ queryKey: computeKeys.notifications(queryIdentity) })
      ),
      queryClient.invalidateQueries({ queryKey: computeKeys.emailInvites(queryIdentity, TRACKING_DAYS) }),
    ])
  }, [notificationsQuery.data, queryClient, queryIdentity, walletIdentity])

  const submitInvitation = (event: FormEvent) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLocaleLowerCase()
    setConfirmation('')
    if (!isValidEmail(normalizedEmail)) {
      setEmailError('请输入有效的电子邮箱')
      return
    }
    setEmailError('')
    createMutation.mutate(normalizedEmail)
  }

  const close = () => {
    setView('invite')
    setEmailError('')
    setConfirmation('')
    onClose()
  }

  return (
    <>
      <Drawer opened={opened} onClose={close} position="right" size="md" title="邀请好友" padding="lg">
        {view === 'invite' ? (
          <Stack gap="lg">
            <Stack gap={4}>
              <Text fw={700} size="lg">
                邀请好友加入 KOD
              </Text>
              <Text size="sm" c="dimmed">
                添加邮箱只会记录邀请，不会由 KOD 发送邮件。好友注册并验证邮箱后，你将获得 10 奖励卡时。
              </Text>
              <Text size="sm" c="dimmed">
                奖励卡时可用于平台消费，不可提现、不可回购。
              </Text>
            </Stack>

            <form onSubmit={submitInvitation}>
              <Stack gap="sm">
                <TextInput
                  type="email"
                  label="电子邮箱"
                  placeholder="添加电子邮箱"
                  value={email}
                  error={emailError}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  leftSection={<IconMailPlus size={17} />}
                />
                <Button type="submit" loading={createMutation.isPending}>
                  添加邀请
                </Button>
              </Stack>
            </form>

            {confirmation && <Alert color={createMutation.isError ? 'red' : 'blue'}>{confirmation}</Alert>}

            <Divider label="或" labelPosition="center" />

            <Button
              variant="light"
              leftSection={<IconCopy size={17} />}
              disabled={!profileQuery.data?.registrationLink}
              loading={profileQuery.isLoading}
              onClick={() => {
                const registrationLink = profileQuery.data?.registrationLink
                if (!registrationLink) return
                copyToClipboard(registrationUrl(registrationLink))
                setConfirmation('注册链接已复制')
              }}
            >
              复制注册链接
            </Button>
            {profileQuery.isError && (
              <Text size="sm" c="red">
                暂时无法加载专属链接，请确认已登录后重试。
              </Text>
            )}

            <Button variant="subtle" onClick={() => setView('tracking')}>
              跟踪邀请
            </Button>
          </Stack>
        ) : (
          <Stack gap="md" h="100%">
            <Group justify="space-between">
              <ActionIcon variant="subtle" aria-label="返回邀请" onClick={() => setView('invite')}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <Text fw={700}>过去 90 天</Text>
              <ActionIcon variant="subtle" aria-label="刷新邀请" onClick={() => void trackingQuery.refetch()}>
                <IconUsersPlus size={18} />
              </ActionIcon>
            </Group>

            {trackingQuery.isLoading ? (
              <Text c="dimmed">正在加载邀请记录…</Text>
            ) : trackingQuery.isError ? (
              <Alert color="red">暂时无法加载邀请记录，请稍后重试。</Alert>
            ) : trackingQuery.data?.length ? (
              <ScrollArea flex={1}>
                <Stack gap="xs">
                  {trackingQuery.data.map((invitation) => {
                    const status = invitationStatus[invitation.status]
                    const completedAt = invitation.acceptedAt || invitation.createdAt
                    return (
                      <Flex key={invitation.id} gap="sm" align="flex-start" py="sm">
                        <Avatar color="gray" radius="xl" aria-label={`${invitation.email} 首字母`}>
                          {emailInitial(invitation.email)}
                        </Avatar>
                        <Stack gap={3} flex={1}>
                          <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" fw={600} lineClamp={1}>
                              {invitation.email}
                            </Text>
                            <Badge
                              color={status.color}
                              variant="light"
                              data-color={status.color}
                              data-testid={`invite-status-${invitation.status}`}
                            >
                              {status.label}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {formatLocalDateTime(completedAt)}
                          </Text>
                          <ActionIcon
                            variant="subtle"
                            aria-label={`复制 ${invitation.email} 注册链接`}
                            onClick={() => copyToClipboard(registrationUrl(invitation.registrationLink))}
                          >
                            <IconCopy size={16} />
                          </ActionIcon>
                          {(invitation.status === 'FAILED' || invitation.status === 'EXPIRED') && (
                            <Text size="xs" c="red">
                              {safeFailureReason(invitation)}
                            </Text>
                          )}
                        </Stack>
                      </Flex>
                    )
                  })}
                </Stack>
              </ScrollArea>
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                过去 90 天暂无邀请记录
              </Text>
            )}
          </Stack>
        )}
      </Drawer>
      <Modal opened={Boolean(rewardReceipt)} onClose={() => setRewardReceipt('')} centered title="邀请奖励">
        <Alert color="green" icon={<IconCheck size={18} />}>
          {rewardReceipt}
        </Alert>
      </Modal>
    </>
  )
}

export function ReferralDrawerLauncher({ compact = false, onOpened }: { compact?: boolean; onOpened?: () => void }) {
  const [opened, setOpened] = useState(false)
  const open = () => {
    setOpened(true)
    onOpened?.()
  }

  return (
    <>
      {compact ? (
        <ActionIcon variant="transparent" color="chatbox-secondary" size={24} aria-label="邀请好友" onClick={open}>
          <ScalableIcon icon={IconUsersPlus} size={20} />
        </ActionIcon>
      ) : (
        <NavLink
          component="button"
          c="chatbox-secondary"
          className="rounded"
          label="邀请好友"
          leftSection={<ScalableIcon icon={IconUsersPlus} size={20} />}
          onClick={open}
          variant="light"
          p="xs"
        />
      )}
      <ReferralDrawer opened={opened} onClose={() => setOpened(false)} />
    </>
  )
}
