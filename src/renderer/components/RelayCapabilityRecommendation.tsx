import { Button, Group, Text } from '@mantine/core'
import { IconAlertTriangle, IconX } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { useStore } from 'zustand'
import { clearKodRelayRecommendation, kodRelayStore, selectKodRelay } from '@/hooks/useKodRelay'

export function RelayCapabilityRecommendation() {
  const { t } = useTranslation()
  const recommendation = useStore(kodRelayStore, (state) => state.recommendation)
  if (!recommendation) return null
  const { requirement, target, models } = recommendation

  return (
    <div className="fixed left-1/2 top-5 z-[10000] w-[min(92vw,640px)] -translate-x-1/2">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-xl">
        <div className="flex items-start gap-3">
          <IconAlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <Text size="sm" fw={700} c="yellow.9">
              {t(
                'The current model does not support {{requirement}}, and has automatically fallen back to the last available API',
                {
                  requirement: requirement.label,
                }
              )}
            </Text>
            <Text size="xs" c="yellow.9" mt={4}>
              {models.length > 0
                ? t('In relay station {{station}}, the following models support this capability. Click to switch:', {
                    station: target.selection.stationUrl,
                  })
                : t(
                    'No model in relay station {{station}} can be confirmed by the local model registry to support this capability.',
                    {
                      station: target.selection.stationUrl,
                    }
                  )}
            </Text>
            {models.length > 0 && (
              <Group gap="xs" mt="sm">
                {models.map((model) => (
                  <Button
                    key={model.modelId}
                    size="compact-xs"
                    variant="light"
                    color="yellow"
                    onClick={() =>
                      void selectKodRelay({ ...target.selection, modelId: model.modelId }).then(() =>
                        clearKodRelayRecommendation()
                      )
                    }
                  >
                    {model.nickname || model.modelId}
                  </Button>
                ))}
              </Group>
            )}
          </div>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            px={4}
            aria-label={t('Close model recommendation')}
            onClick={clearKodRelayRecommendation}
          >
            <IconX size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
