import { Button, Group, Text } from '@mantine/core'
import { IconAlertTriangle, IconX } from '@tabler/icons-react'
import { useStore } from 'zustand'
import { clearKodRelayRecommendation, kodRelayStore, selectKodRelay } from '@/hooks/useKodRelay'

export function RelayCapabilityRecommendation() {
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
              当前模型不支持{requirement.label}，已自动回退到上一个可用 API
            </Text>
            <Text size="xs" c="yellow.9" mt={4}>
              {models.length > 0
                ? `零售站 ${target.selection.stationUrl} 中以下模型支持该能力，点击即可切换：`
                : `零售站 ${target.selection.stationUrl} 中没有可由本地模型注册表确认支持该能力的模型。`}
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
            aria-label="关闭模型推荐"
            onClick={clearKodRelayRecommendation}
          >
            <IconX size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
