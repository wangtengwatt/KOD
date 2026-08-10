import { Button, Flex, Stack, Text } from '@mantine/core'
import type { ProviderModelInfo } from '@shared/types'
import { IconRefresh, IconRestore } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { ModelList } from '@/components/ModelList'

interface ModelManagementProps {
  showControls?: boolean
  kodAIModels: ProviderModelInfo[]
  allKodAIModels: ProviderModelInfo[]
  onDeleteModel: (modelId: string) => void
  onResetModels: () => void
  onFetchModels: () => void
  onAddModel: (model: ProviderModelInfo) => void
  onRemoveModel: (modelId: string) => void
}

export function ModelManagement({
  kodAIModels,
  allKodAIModels,
  onDeleteModel,
  onResetModels,
  onFetchModels,
  onAddModel,
  onRemoveModel,
  showControls = true,
}: ModelManagementProps) {
  const { t } = useTranslation()
  const [showFetchedModels, setShowFetchedModels] = useState(false)

  const handleFetchModels = () => {
    onFetchModels()
    setShowFetchedModels(true)
  }

  return (
    <>
      <Stack gap="xxs">
        <Flex justify="space-between" align="center">
          <Text span fw="600">
            {t('Model')}
          </Text>
          {showControls && (
            <Flex gap="sm" align="center" justify="flex-end">
              <Button
                variant="light"
                color="kod-gray"
                c="kod-secondary"
                size="compact-xs"
                px="sm"
                onClick={onResetModels}
                leftSection={<ScalableIcon icon={IconRestore} size={12} />}
              >
                {t('Reset')}
              </Button>

              <Button
                variant="light"
                color="kod-gray"
                c="kod-secondary"
                size="compact-xs"
                px="sm"
                onClick={handleFetchModels}
                leftSection={<ScalableIcon icon={IconRefresh} size={12} />}
              >
                {t('Fetch')}
              </Button>
            </Flex>
          )}
        </Flex>

        <ModelList
          models={kodAIModels}
          showActions={showControls}
          onDeleteModel={onDeleteModel}
          showSearch={false}
        />
      </Stack>

      {showControls && (
        <AdaptiveModal
          keepMounted={false}
          opened={showFetchedModels}
          onClose={() => setShowFetchedModels(false)}
          title={t('Models')}
          centered={true}
          size="lg"
        >
          <ModelList
            models={allKodAIModels}
            showActions={true}
            onAddModel={onAddModel}
            onRemoveModel={onRemoveModel}
            displayedModelIds={kodAIModels.map((m) => m.modelId)}
            showSearch={true}
          />
        </AdaptiveModal>
      )}
    </>
  )
}
