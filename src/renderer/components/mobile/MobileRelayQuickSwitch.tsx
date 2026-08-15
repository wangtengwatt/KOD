import { Paper, Text } from '@mantine/core'
import { useLocation } from '@tanstack/react-router'
import { BalanceInsufficientToast } from '@/components/BalanceInsufficientToast'
import { RelayCapabilityRecommendation } from '@/components/RelayCapabilityRecommendation'
import { RelayNoticeToast } from '@/components/RelayNoticeToast'
import { RelayStationSelector } from '@/components/RelayStationSelector'
import { useKodRelay } from '@/hooks/useKodRelay'
import platform from '@/platform'
import { useAuthInfoStore } from '@/stores/authInfoStore'

export function MobileRelayQuickSwitch() {
  const location = useLocation()
  const relay = useKodRelay()
  const loggedIn = useAuthInfoStore((state) => Boolean(state.accessToken && state.refreshToken))
  const isChat = location.pathname === '/' || location.pathname.startsWith('/session/')

  return (
    <>
      {platform.type === 'mobile' && loggedIn && isChat && (
        <Paper
          withBorder
          shadow="sm"
          p="xs"
          radius="md"
          className="fixed left-2 right-2 z-[1150]"
          style={{ top: 'calc(var(--mobile-safe-area-inset-top, 0px) + 0.5rem)' }}
        >
          <Text size="xxs" fw={700} mb={4}>
            零售站 / 节点
          </Text>
          <RelayStationSelector
            apiBaseUrl={relay.apiOrigin}
            selectedStationId={relay.selection?.stationId}
            selectedApiKeyId={relay.selection?.apiKeyId}
            loading={relay.loading}
            onSelect={(selection) =>
              relay.select(
                selection && relay.selection?.modelId ? { ...selection, modelId: relay.selection.modelId } : selection
              )
            }
          />
        </Paper>
      )}
      {relay.notice === 'balance' && <BalanceInsufficientToast onClose={() => relay.setNotice(null)} />}
      {relay.notice === 'package' && <BalanceInsufficientToast kind="package" onClose={() => relay.setNotice(null)} />}
      {relay.notice === 'conflict' && (
        <RelayNoticeToast message="所选节点已被占用，请重新选择" onClose={() => relay.setNotice(null)} />
      )}
      {relay.notice === 'unavailable' && (
        <RelayNoticeToast message="零售站节点尚未就绪，请重新选择节点" onClose={() => relay.setNotice(null)} />
      )}
      <RelayCapabilityRecommendation />
    </>
  )
}
