import { Button, Flex, Paper, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { trackJkClickEvent } from '@/analytics/jk'
import { JK_EVENTS } from '@/analytics/jk-events'
import { navigateToSettings } from '@/modals/Settings'
import platform from '@/platform'
import type { HomeWelcomeCardMode } from '@/utils/homeWelcomeCard'

const KOD_SETTINGS_URL = 'https://kod.kai.com/settings'

export function KodWelcomeCard(props: { mode: HomeWelcomeCardMode; pageName: string; className?: string }) {
  const { mode, pageName, className } = props
  const { t } = useTranslation()

  if (mode === 'none') {
    return null
  }

  return (
    <Paper
      radius="md"
      withBorder
      py="md"
      px="sm"
      className={`bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md ${className || ''}`}
    >
      <Stack gap="sm">
        <Stack gap="xxs" align="center">
          <Text fw={600} className="text-center">
            {t('Welcome to KOD!')}
          </Text>

          <Text size="xs" c="kod-tertiary" className="text-center">
            {mode === 'login' ? t('Sign in to start chatting with AI') : t('KOD AI access is not configured')}
          </Text>
        </Stack>

        <Flex gap="xs" justify="center" align="center" wrap="wrap">
          {mode === 'login' ? (
            <>
              <Button
                size="xs"
                variant="filled"
                h={32}
                miw={160}
                fw={600}
                flex="0 1 auto"
                onClick={() => {
                  trackJkClickEvent(JK_EVENTS.LOGIN_BUTTON_CLICK, { pageName })
                  navigateToSettings('chatbox-ai')
                }}
              >
                {t('Sign in to KOD AI')}
              </Button>
              <Button
                size="xs"
                variant="subtle"
                c="kod-tertiary"
                h={32}
                fw={400}
                flex="0 1 auto"
                onClick={() => navigateToSettings('provider')}
              >
                {t('Other options')}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="xs"
                variant="filled"
                h={32}
                miw={160}
                fw={600}
                flex="0 1 auto"
                onClick={() => platform.openLink(KOD_SETTINGS_URL)}
              >
                {t('Open KOD Settings')}
              </Button>
              <Button
                size="xs"
                variant="subtle"
                c="kod-tertiary"
                h={32}
                fw={400}
                flex="0 1 auto"
                onClick={() => navigateToSettings('chatbox-ai')}
              >
                {t('Configure KOD AI')}
              </Button>
            </>
          )}
        </Flex>
      </Stack>
    </Paper>
  )
}
