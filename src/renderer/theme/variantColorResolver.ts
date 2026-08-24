import { defaultVariantColorsResolver, type VariantColorsResolver } from '@mantine/core'

/**
 * Keeps semantic brand buttons readable when the brand surface changes between
 * a dark fill in light mode and a light fill in dark mode.
 */
export const kodVariantColorResolver: VariantColorsResolver = (input) => {
  const colors = defaultVariantColorsResolver(input)

  if (input.variant === 'filled' && input.color === 'chatbox-brand') {
    return {
      ...colors,
      color: 'var(--chatbox-tint-on-brand)',
    }
  }

  return colors
}
