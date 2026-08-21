// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComputeReferralProfile } from '@/packages/computeCenter'

const mocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  createEmailInvitation: vi.fn(),
  getComputeReferralProfile: vi.fn(),
  listComputeNotifications: vi.fn(),
  listEmailInvitations: vi.fn(),
  markComputeNotificationRead: vi.fn(),
}))

vi.mock('@/packages/computeCenter', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/packages/computeCenter')>()
  return {
    ...original,
    createEmailInvitation: mocks.createEmailInvitation,
    getComputeReferralProfile: mocks.getComputeReferralProfile,
    listComputeNotifications: mocks.listComputeNotifications,
    listEmailInvitations: mocks.listEmailInvitations,
    markComputeNotificationRead: mocks.markComputeNotificationRead,
  }
})
vi.mock('@/packages/navigator', () => ({ copyToClipboard: mocks.copyToClipboard }))
vi.mock('@/packages/kodApiOrigin', () => ({ getKodApiOrigin: () => 'https://kod.example/' }))
vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: { subscribe: vi.fn() },
  useAuthInfoStore: (selector: (state: { accessToken: string; refreshToken: string; loginEmail: string }) => unknown) =>
    selector({
      accessToken: 'test-token',
      refreshToken: 'test-refresh-token',
      loginEmail: 'Member@Example.com',
    }),
}))

import ReferralDrawer, { ReferralDrawerLauncher } from './ReferralDrawer'

const profile = {
  inviteCode: '0123456789abcdef0123456789abcdef',
  inviteLink: 'kod://compute/invite?code=legacy-link',
  registrationLink: '/register',
  rewardPolicy: 'LEGACY_READ_ONLY',
  invitedCount: 1,
  pendingCommission: 0,
  paidCommission: 0,
  bound: false,
  canBind: true,
  bindReason: '',
} satisfies ComputeReferralProfile

const invitation = {
  id: '101',
  inviterUserId: '7',
  email: 'friend@example.com',
  inviteCode: '0123456789abcdef0123456789abcdef',
  inviteeUserId: null,
  status: 'PENDING' as const,
  failureReason: '',
  createdAt: '2026-08-21T12:00:00',
  acceptedAt: null,
  expiresAt: '2026-09-20T12:00:00',
  registrationLink: '/register?email=friend%40example.com&emailInvite=0123456789abcdef0123456789abcdef',
}

function renderDrawer(ui = <ReferralDrawer opened onClose={() => {}} />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MantineProvider>{ui}</MantineProvider>
      </QueryClientProvider>
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getComputeReferralProfile.mockResolvedValue(profile)
  mocks.listEmailInvitations.mockResolvedValue([])
  mocks.listComputeNotifications.mockResolvedValue([])
  mocks.markComputeNotificationRead.mockResolvedValue({ read: true })
  mocks.createEmailInvitation.mockResolvedValue({ acknowledgment: 'Invitation request received.' })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
})

afterEach(() => {
  cleanup()
})

describe('ReferralDrawer', () => {
  it('records an invitation with one generic confirmation and copies the profile registration link', async () => {
    renderDrawer()

    expect(screen.getByText('奖励卡时可用于平台消费，不可提现、不可回购。')).toBeTruthy()
    expect(screen.getByLabelText('电子邮箱')).toBeTruthy()
    const copyButton = await screen.findByRole('button', { name: '复制注册链接' })
    await waitFor(() => expect(copyButton.hasAttribute('disabled')).toBe(false))
    fireEvent.click(copyButton)
    expect(mocks.copyToClipboard).toHaveBeenCalledWith('https://kod.example/register')
    expect(mocks.copyToClipboard).not.toHaveBeenCalledWith(profile.inviteLink)

    const email = screen.getByPlaceholderText('添加电子邮箱')
    fireEvent.change(email, { target: { value: ' friend@example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: '添加邀请' }))

    await waitFor(() => expect(mocks.createEmailInvitation.mock.calls[0]?.[0]).toBe('friend@example.com'))
    expect(screen.getByText('邀请请求已记录')).toBeTruthy()
    expect(screen.queryByText('Invitation request received.')).toBeNull()
    expect(screen.queryByText(/已发送/)).toBeNull()
    expect(mocks.listEmailInvitations).not.toHaveBeenCalled()
  })

  it('tracks only persisted records from the past 90 days with initials, times, colors, and safe reasons', async () => {
    mocks.listEmailInvitations.mockResolvedValue([
      invitation,
      {
        ...invitation,
        id: '102',
        email: 'accepted@example.com',
        status: 'ACCEPTED',
        inviteeUserId: '9',
        acceptedAt: '2026-08-22T08:30:00',
      },
      {
        ...invitation,
        id: '103',
        email: 'failed@example.com',
        status: 'FAILED',
        failureReason: 'account already has another inviter',
      },
      {
        ...invitation,
        id: '104',
        email: 'expired@example.com',
        status: 'EXPIRED',
        failureReason: 'internal-expiry-detail',
      },
    ])
    renderDrawer()

    fireEvent.click(screen.getByRole('button', { name: '跟踪邀请' }))

    expect(await screen.findByText('过去 90 天')).toBeTruthy()
    expect(mocks.listEmailInvitations).toHaveBeenCalledWith(90)
    expect((await screen.findByLabelText('friend@example.com 首字母')).textContent).toBe('F')
    expect(screen.getAllByText('2026/08/21 12:00')).toHaveLength(3)
    expect(screen.getByTestId('invite-status-PENDING').getAttribute('data-color')).toBe('gray')
    expect(screen.getByTestId('invite-status-ACCEPTED').getAttribute('data-color')).toBe('green')
    expect(screen.getByTestId('invite-status-FAILED').getAttribute('data-color')).toBe('red')
    expect(screen.getByTestId('invite-status-EXPIRED').getAttribute('data-color')).toBe('red')
    expect(screen.getByText('该账号已绑定其他邀请人')).toBeTruthy()
    expect(screen.getByText('邀请已过期')).toBeTruthy()
    expect(screen.queryByText('account already has another inviter')).toBeNull()
    expect(screen.queryByText('internal-expiry-detail')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '复制 friend@example.com 注册链接' }))
    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      'https://kod.example/register?email=friend%40example.com&emailInvite=0123456789abcdef0123456789abcdef'
    )
  })

  it('shows the unified reward receipt and refreshes account, notifications, and tracking', async () => {
    mocks.listComputeNotifications.mockResolvedValue([
      {
        id: 501,
        notificationType: 'REFERRAL_REGISTRATION_REWARDED',
        title: '邀请注册奖励已到账',
        content: '10 卡时已到账',
        referenceType: 'REFERRAL',
        referenceId: '101',
        isRead: 0,
        createTime: '2026-08-22T08:30:00',
        readTime: null,
      },
    ])
    const { queryClient } = renderDrawer()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    expect(await screen.findByText('10 卡时已到账')).toBeTruthy()
    expect(mocks.markComputeNotificationRead).toHaveBeenCalledWith(501)
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['compute', 'member@example.com', 'account'] })
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['wallet', 'member@example.com', 'card-time-account'],
      })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['compute', 'member@example.com', 'ledger'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['compute', 'member@example.com', 'notifications'] })
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['compute', 'member@example.com', 'referrals', 'email-invites', 90],
      })
    })
  })

  it('does not replay a historical reward notification that is already read', async () => {
    mocks.listComputeNotifications.mockResolvedValue([
      {
        id: 500,
        notificationType: 'REFERRAL_REGISTRATION_REWARDED',
        title: '邀请注册奖励已到账',
        content: '10 卡时已到账',
        referenceType: 'REFERRAL',
        referenceId: '100',
        isRead: 1,
        createTime: '2026-07-01T08:30:00',
        readTime: '2026-07-01T08:31:00',
      },
    ])

    const { queryClient } = renderDrawer(<ReferralDrawer opened={false} onClose={() => {}} />)

    await waitFor(() =>
      expect(queryClient.getQueryData(['compute', 'member@example.com', 'notifications'])).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 500, isRead: 1 })])
      )
    )
    await waitFor(() => expect(screen.queryByText('10 卡时已到账')).toBeNull())
    expect(mocks.markComputeNotificationRead).not.toHaveBeenCalled()
  })

  it('detects an accepted-registration reward while the invitation drawer is closed', async () => {
    mocks.listComputeNotifications.mockResolvedValue([
      {
        id: 502,
        notificationType: 'REFERRAL_REGISTRATION_REWARDED',
        title: '邀请注册奖励已到账',
        content: '10 卡时已到账',
        referenceType: 'REFERRAL',
        referenceId: '102',
        isRead: 0,
        createTime: '2026-08-22T08:30:00',
        readTime: null,
      },
    ])

    renderDrawer(<ReferralDrawer opened={false} onClose={() => {}} />)

    expect(await screen.findByText('10 卡时已到账')).toBeTruthy()
  })

  it('opens from the first-level invitation launcher', async () => {
    renderDrawer(<ReferralDrawerLauncher />)

    fireEvent.click(screen.getByRole('button', { name: '邀请好友' }))

    expect(await screen.findByPlaceholderText('添加电子邮箱')).toBeTruthy()
  })
})
