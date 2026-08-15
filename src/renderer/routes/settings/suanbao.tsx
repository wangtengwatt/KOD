import { Button, SegmentedControl, Stack, Switch, Text, Title } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { SuanbaoManagement } from '@/components/suanbao/SuanbaoManagement'
import { useSuanbaoStore } from '@/components/suanbao/suanbaoStore'

export const Route = createFileRoute('/settings/suanbao')({
  component: RouteComponent,
})

export function RouteComponent() {
  const { t } = useTranslation()
  const enabled = useSuanbaoStore((state) => state.enabled)
  const hidden = useSuanbaoStore((state) => state.hidden)
  const animation = useSuanbaoStore((state) => state.animation)
  const activeMode = useSuanbaoStore((state) => state.activeMode)
  const soundEnabled = useSuanbaoStore((state) => state.soundEnabled)
  const locked = useSuanbaoStore((state) => state.locked)
  const setPreferences = useSuanbaoStore((state) => state.setPreferences)
  const restore = useSuanbaoStore((state) => state.restore)

  return (
    <Stack p="xl" gap="lg" maw={640}>
      <div>
        <Title order={3}>{t('Suanbao')}</Title>
        <Text c="dimmed" mt={4}>
          {t(
            'Configure the local garlic coding companion. Preferences and position are stored separately for each signed-in account.'
          )}
        </Text>
      </div>
      <Switch
        label={t('Enable Suanbao')}
        description={t('Show Suanbao across KOD pages, including image generation.')}
        checked={enabled}
        onChange={(event) => setPreferences({ enabled: event.currentTarget.checked })}
      />
      <Switch
        label={t('Hidden')}
        description={t('Use this to temporarily hide Suanbao without disabling it.')}
        checked={hidden}
        onChange={(event) => setPreferences({ hidden: event.currentTarget.checked })}
      />
      <Switch
        label={t('Active mode')}
        description={t('Allow occasional animations and proactive bubbles outside do-not-disturb hours.')}
        checked={activeMode}
        onChange={(event) => setPreferences({ activeMode: event.currentTarget.checked })}
      />
      <Switch
        label={t('Sound')}
        description={t('Play Suanbao interaction sounds. Sound is off by default.')}
        checked={soundEnabled}
        onChange={(event) => setPreferences({ soundEnabled: event.currentTarget.checked })}
      />
      <Switch
        label={t('Lock position')}
        description={t('Prevent dragging Suanbao until this option is turned off.')}
        checked={locked}
        onChange={(event) => setPreferences({ locked: event.currentTarget.checked })}
      />
      <Stack gap="xs">
        <Text fw={600}>{t('Animation')}</Text>
        <SegmentedControl
          value={animation}
          onChange={(value) => setPreferences({ animation: value as 'full' | 'reduced' | 'off' })}
          data={[
            { label: t('Full'), value: 'full' },
            { label: t('Reduced'), value: 'reduced' },
            { label: t('Off'), value: 'off' },
          ]}
        />
      </Stack>
      <SuanbaoManagement />
      <Button variant="light" onClick={restore}>
        {t('Restore defaults and position')}
      </Button>
      <Text size="xs" c="dimmed">
        {t(
          'Suanbao analytics contain only action names, never prompts, code, errors, chat titles, paths, or message content, and are emitted only when app analytics consent is enabled.'
        )}
      </Text>
    </Stack>
  )
}
