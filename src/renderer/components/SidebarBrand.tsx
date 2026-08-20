import { Box, Image, Text } from '@mantine/core'
import kaiWordmark from '../static/KAI.svg'

export function SidebarBrand({ version, onAbout }: { version: string; onAbout: () => void }) {
  return (
    <Box
      component="a"
      role="link"
      tabIndex={0}
      aria-label="前往关于 KAI"
      onClick={onAbout}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onAbout()
      }}
      className="flex items-center gap-2 cursor-pointer"
    >
      <Image src={kaiWordmark} alt="KAI" w={72} h={32} fit="contain" />
      {/\d/.test(version) && (
        <Text span c="chatbox-tertiary" size="sm">
          {version}
        </Text>
      )}
    </Box>
  )
}
