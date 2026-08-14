import type { SuanbaoPetState } from '@shared/types/suanbao'
import mascotImage from '@/static/logos/suanbao-mascot.png'
import mascotThinkingImage from '@/static/logos/suanbao-thinking.png'

interface SuanbaoMascotProps {
  state: SuanbaoPetState
  animation?: string
  className?: string
}

export function SuanbaoMascot({ state, animation, className }: SuanbaoMascotProps) {
  const classes = [
    'suanbao-mascot',
    `suanbao-mascot-state-${state}`,
    animation ? `suanbao-mascot-animation-${animation}` : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const image = state === 'thinking' ? mascotThinkingImage : mascotImage

  return (
    <span className={classes} aria-hidden="true">
      <img className="suanbao-mascot-image" src={image} alt="" draggable={false} />
    </span>
  )
}
