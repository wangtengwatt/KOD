import { beforeEach, describe, expect, it, vi } from 'vitest'

// 用 vi.hoisted 保证 mock 引用在 hoisted 的 vi.mock 里可用
const mocks = vi.hoisted(() => ({
  trackingEvent: vi.fn(),
  getSettings: vi.fn(),
  suanbaoStoreGetState: vi.fn(),
  getSuanbaoRepository: vi.fn(),
  clearAll: vi.fn(),
}))

vi.mock('@/platform', () => ({
  default: { getSettings: mocks.getSettings, trackingEvent: mocks.trackingEvent },
}))

vi.mock('@/components/suanbao/suanbaoStore', () => ({
  suanbaoStore: { getState: mocks.suanbaoStoreGetState },
}))

vi.mock('./repositories/createSuanbaoRepository', () => ({
  getSuanbaoRepository: mocks.getSuanbaoRepository,
}))

// eslint-disable-next-line import/first
import { clearSuanbaoData, trackSuanbao } from './api'

const ACCOUNT_KEY = 'test-account-key'

describe('trackSuanbao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue({ allowReportingAndTracking: true })
  })

  it('allowReportingAndTracking === false 时不上报', async () => {
    mocks.getSettings.mockResolvedValue({ allowReportingAndTracking: false })
    await trackSuanbao('data_cleared', { cleared_at: '1' })
    expect(mocks.trackingEvent).not.toHaveBeenCalled()
  })

  it('allowReportingAndTracking 非 false 时上报，标量 props 转 string', async () => {
    await trackSuanbao('data_cleared', { cleared_at: 123, count: 1, ok: true })
    expect(mocks.trackingEvent).toHaveBeenCalledWith('data_cleared', {
      cleared_at: '123',
      count: '1',
      ok: 'true',
    })
  })

  it('剔除 arch §15.3 禁止的敏感字段，保留合法标量（含 error_code）', async () => {
    await trackSuanbao('data_cleared', {
      cleared_at: 123,
      action: 'pet',
      error_code: 'E_TIMEOUT',
      prompt: 'secret prompt',
      message: 'secret msg',
      lat: 1.5,
      city: 'Shanghai',
      title: 'todo title',
      path: '/secret/file',
      code: 'console.log(x)',
    })
    expect(mocks.trackingEvent).toHaveBeenCalledWith('data_cleared', {
      cleared_at: '123',
      action: 'pet',
      error_code: 'E_TIMEOUT',
    })
  })
})

describe('clearSuanbaoData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.suanbaoStoreGetState.mockReturnValue({ accountKey: ACCOUNT_KEY })
    mocks.getSettings.mockResolvedValue({ allowReportingAndTracking: true })
    mocks.getSuanbaoRepository.mockReturnValue({ clearAll: mocks.clearAll })
    mocks.clearAll.mockResolvedValue(undefined)
  })

  it('用 suanbaoStore 的 accountKey 取 repository 并调 clearAll', async () => {
    await clearSuanbaoData()
    expect(mocks.getSuanbaoRepository).toHaveBeenCalledWith(ACCOUNT_KEY)
    expect(mocks.clearAll).toHaveBeenCalledOnce()
  })

  it('清数据后上报 data_cleared（受门控）', async () => {
    await clearSuanbaoData()
    expect(mocks.trackingEvent).toHaveBeenCalledWith(
      'data_cleared',
      expect.objectContaining({ cleared_at: expect.any(String) })
    )
  })

  it('allowReportingAndTracking === false 时仍清数据，但不上报', async () => {
    mocks.getSettings.mockResolvedValue({ allowReportingAndTracking: false })
    await clearSuanbaoData()
    expect(mocks.clearAll).toHaveBeenCalledOnce()
    expect(mocks.trackingEvent).not.toHaveBeenCalled()
  })
})
