import { Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useEffect } from 'react'

export function RelayNoticeToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed left-1/2 top-5 z-[9999] w-[min(92vw,640px)] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 shadow-xl">
        <IconAlertTriangle size={20} className="shrink-0 text-amber-600" />
        <Text size="sm" fw={600} c="yellow.9">
          {message}
        </Text>
      </div>
    </div>
  )
}
