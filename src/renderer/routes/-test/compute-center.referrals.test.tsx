// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ComputeAccount } from '@/packages/computeCenter'
import { AssetDashboard, ReferralInviteModal } from '../compute-center'

const account: ComputeAccount = {
  userId: '7',
  email: 'member@example.com',
  cnyBalance: 25,
  availableCardHours: 100,
  spendableCardHours: 100,
  redeemableCardHours: 90,
  rewardCardHours: 10,
  frozenCardHours: 0,
  lifetimeIncome: 12,
  lifetimeConsumption: 3,
  rentalIncome: 4,
  rentalIncomeCnyEquivalent: 4,
  commissionIncome: 0,
  pendingCommission: 0,
  totalIncomeCny: 4,
  invitedCount: 1,
  apiSalesIncome: 8,
  withdrawableCardHours: 90,
  supplierStatus: 'APPROVED',
  identityStatus: 'APPROVED',
  isAdmin: false,
  roles: ['BUYER'],
  deviceCounts: { PENDING: 0, DEPLOYING: 0, RUNNING: 1, PENDING_ACTION: 0 },
  gpuAssetCounts: {
    PENDING: 0,
    REJECTED: 0,
    RUNNING: 1,
    PENDING_DELIVERY: 0,
    ACTIVE_RENTAL: 0,
    PENDING_ACTION: 0,
    OFFLINE: 0,
  },
  cardHourCnyRate: 1.002,
  cardHourRedeemRate: 1,
  unitName: '卡时',
  currency: 'CNY',
  unreadNotifications: 0,
}

beforeAll(() => {
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

afterEach(cleanup)

describe('active account dashboard referrals', () => {
  it('keeps invitations in the sidebar drawer without a duplicate legacy commission tab', () => {
    const routeSource = readFileSync(resolve(process.cwd(), 'src/renderer/routes/compute-center.tsx'), 'utf8')

    expect(routeSource).not.toContain('历史邀请佣金')
    expect(routeSource).not.toContain('ReferralRewardsTable')
    expect(routeSource).not.toContain('listComputeReferralRewards')
  })

  it('does not market legacy first-top-up RMB commissions', () => {
    render(
      <MantineProvider>
        <AssetDashboard account={account} onOpen={vi.fn()} />
      </MantineProvider>
    )

    expect(screen.queryByText('首次充值返佣 5%')).toBeNull()
    expect(screen.queryByText('待发放佣金')).toBeNull()
    expect(screen.queryByText('已进入人民币钱包')).toBeNull()
    expect(screen.queryByText(/每名好友最高奖励/)).toBeNull()
  })

  it('does not promise legacy RMB rewards in the active deep-link binding dialog', () => {
    render(
      <MantineProvider>
        <ReferralInviteModal
          opened
          preview={{
            inviteCode: '0123456789abcdef0123456789abcdef',
            inviterEmail: 'in***@example.com',
            canBind: true,
            reason: '',
          }}
          loading={false}
          error={null}
          busy={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      </MantineProvider>
    )

    expect(screen.getByRole('alert').textContent).toContain('绑定后永久不能更改。邀请关系和奖励以服务端验证结果为准。')
    expect(screen.queryByText(/充值金额 5%/)).toBeNull()
    expect(screen.queryByText(/¥100/)).toBeNull()
  })
})
