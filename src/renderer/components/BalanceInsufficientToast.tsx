import { Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getChatboxOrigin } from '@/packages/remote'

export function BalanceInsufficientToast({
  onClose,
  kind = 'balance',
}: {
  onClose: () => void
  kind?: 'balance' | 'package'
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    const hideTimer = setTimeout(() => setVisible(false), 2800)
    const closeTimer = setTimeout(onClose, 3000)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(hideTimer)
      clearTimeout(closeTimer)
    }
  }, [onClose])

  return (
    <div
      className="fixed left-1/2 top-5 z-[9999] -translate-x-1/2 transition-all duration-300"
      style={{ transform: `translateX(-50%) translateY(${visible ? 0 : -20}px)`, opacity: visible ? 1 : 0 }}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-4 shadow-xl">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-100">
          <IconAlertTriangle size={20} className="text-red-500" />
        </span>
        <Text size="sm" fw={600} c="red.9">
          {kind === 'package' ? '该模型输入或输出 Token 套餐已耗尽，请前往' : '余额不足，请前往'}
          {kind === 'package' ? (
            <Link to="/compute-center" className="mx-1 font-bold text-indigo-600 underline">
              算力中心
            </Link>
          ) : (
            <a
              href={getChatboxOrigin()}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-1 font-bold text-indigo-600 underline"
            >
              官网
            </a>
          )}
          {kind === 'package' ? '购买套餐' : '充值'}
        </Text>
      </div>
    </div>
  )
}
