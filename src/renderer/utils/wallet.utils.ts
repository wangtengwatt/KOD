export const formatCny = (value: number | string | null | undefined) => {
  const number = typeof value === 'number' ? value : Number(value ?? 0)
  return `¥${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(number) ? number : 0
  )}`
}

export const formatTopupStatus = (status: string) =>
  ({ success: '支付成功', pending: '待支付', expired: '已过期', failed: '支付失败', cancelled: '已取消' })[status] ??
  `未知状态（${status}）`

export const paymentMethodName = (type: string, name?: string) =>
  ({ alipay: '支付宝', wxpay: '微信支付', wechat: '微信支付', wechatpay: '微信支付' })[type.toLowerCase()] ??
  name ??
  type

export type DiscountResult = { actual: number; rate: number; saved: number }

export const calculateDiscount = (amount: number, actualValue: number | string): DiscountResult => {
  const actual = Number(actualValue)
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(actual)) return { actual, rate: 0, saved: 0 }
  const saved = Math.max(0, amount - actual)
  return { actual, rate: Math.max(0, Math.min(1, saved / amount)), saved }
}

export const CARD_TIME_RATE = 1.002
export const rmbToCardTime = (rmb: number) => rmb / CARD_TIME_RATE
export const cardTimeToRmb = (cardTime: number) => cardTime * CARD_TIME_RATE
export const formatCardTime = (value: number | string | null | undefined) => {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0) + ' 卡时'
}
export const formatRmbFromCardTime = (cardTime: number) => formatCny(cardTimeToRmb(cardTime))
