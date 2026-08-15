export function parsePaymentHosts(value: string | undefined, apiOrigin: string): Set<string> {
  const configured = (value ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return new Set(configured.length ? configured : [new URL(apiOrigin).hostname.toLowerCase(), 'mzf.mapay.cc'])
}
export function assertPaymentUrl(url: string, hosts: ReadonlySet<string>): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('支付链接无效')
  }
  if (parsed.protocol !== 'https:') throw new Error('支付链接必须使用 HTTPS')
  if (parsed.username || parsed.password) throw new Error('支付链接不得包含用户信息')
  if (!hosts.has(parsed.hostname.toLowerCase())) throw new Error('支付链接域名不在允许列表中')
  return parsed
}
