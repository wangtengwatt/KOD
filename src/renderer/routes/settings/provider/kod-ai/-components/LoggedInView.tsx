import { Button, Flex, Paper, Stack, Text, Title } from '@mantine/core'
import { IconExternalLink, IconLogout } from '@tabler/icons-react'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import platform from '@/platform'

interface LoggedInViewProps {
  onLogout: () => void
}

export const LoggedInView = forwardRef<HTMLDivElement, LoggedInViewProps>(({ onLogout }, ref) => {
  const { t } = useTranslation()

  return (
    <Stack gap="xl" ref={ref}>
      <Flex gap="xs" align="center" justify="space-between">
        <Title order={3} c="kod-secondary">
          KOD
        </Title>
        <Button
          variant="transparent"
          c="kod-tertiary"
          px={0}
          h={24}
          onClick={() => platform.openLink('https://kod.kai.com')}
        >
          <ScalableIcon icon={IconExternalLink} size={24} />
        </Button>
      </Flex>

      <Paper shadow="xs" p="md" withBorder>
        <Stack gap="sm">
          <Text fw={600}>{t('You are logged in to KOD')}</Text>
          <Text c="kod-tertiary">
            {t('KOD will use the relay station URL and API key linked to this account to fetch models.')}
          </Text>
          <Flex justify="flex-end">
            <Button
              variant="light"
              color="kod-gray"
              leftSection={<ScalableIcon icon={IconLogout} size={14} />}
              onClick={() => void onLogout()}
            >
              {t('Logout')}
            </Button>
          </Flex>
        </Stack>
      </Paper>
    </Stack>
  )
})

LoggedInView.displayName = 'LoggedInView'
