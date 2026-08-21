import { colorsTuple, createTheme, DEFAULT_THEME, mergeMantineTheme } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { kodVariantColorResolver } from './variantColorResolver'

const theme = mergeMantineTheme(
  DEFAULT_THEME,
  createTheme({
    colors: {
      'chatbox-brand': colorsTuple('#f2f2f2'),
    },
  })
)

const resolve = (color: string, variant: string) =>
  kodVariantColorResolver({
    color,
    variant,
    theme,
    autoContrast: false,
  })

describe('kodVariantColorResolver', () => {
  it('uses the semantic on-brand text color for filled brand controls', () => {
    expect(resolve('chatbox-brand', 'filled').color).toBe('var(--chatbox-tint-on-brand)')
  })

  it('does not change other filled colors', () => {
    expect(resolve('red', 'filled').color).toBe('var(--mantine-color-white)')
    expect(resolve('green', 'filled').color).toBe('var(--mantine-color-white)')
  })

  it('does not change non-filled brand variants', () => {
    expect(resolve('chatbox-brand', 'light').color).toBe('var(--mantine-color-chatbox-brand-light-color)')
  })
})
