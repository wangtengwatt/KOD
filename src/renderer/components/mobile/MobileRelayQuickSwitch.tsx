import { useTranslation } from 'react-i18next'
import { BalanceInsufficientToast } from '@/components/BalanceInsufficientToast'
import { RelayCapabilityRecommendation } from '@/components/RelayCapabilityRecommendation'
import { RelayNoticeToast } from '@/components/RelayNoticeToast'
import { useKodRelay } from '@/hooks/useKodRelay'

export function MobileRelayQuickSwitch() {
  const relay = useKodRelay()
  const { t } = useTranslation()

  return (
    <>
      {relay.notice === 'balance' && <BalanceInsufficientToast onClose={() => relay.setNotice(null)} />}
      {relay.notice === 'package' && <BalanceInsufficientToast kind="package" onClose={() => relay.setNotice(null)} />}
      {relay.notice === 'conflict' && (
        <RelayNoticeToast
          message={t('The selected node is already occupied, please select another node')}
          onClose={() => relay.setNotice(null)}
        />
      )}
      {relay.notice === 'unavailable' && (
        <RelayNoticeToast
          message={t('The relay station node is not ready, please select another node')}
          onClose={() => relay.setNotice(null)}
        />
      )}
      <RelayCapabilityRecommendation />
    </>
  )
}
