import { BalanceInsufficientToast } from '@/components/BalanceInsufficientToast'
import { useKodRelay } from '@/hooks/useKodRelay'

export function MobileRelayQuickSwitch() {
  const relay = useKodRelay()

  return relay.notice === 'package' ? (
    <BalanceInsufficientToast kind="package" onClose={() => relay.setNotice(null)} />
  ) : null
}
