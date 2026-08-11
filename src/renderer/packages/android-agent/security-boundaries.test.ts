import { describe, expect, it } from 'vitest'
import { androidAgentToolSet } from './toolset'
import type { AndroidAgentAction } from './types'

describe('Android agent security boundaries', () => {
  it('does not expose sending, file, shell, intent, or coordinate tools', () => {
    const names = Object.keys(androidAgentToolSet)
    expect(names).toEqual([
      'android_read_ui',
      'android_click',
      'android_input_text',
      'android_scroll',
      'android_back',
    ])
    expect(names.some((name) => /send|upload|share|file|photo|shell|intent|tap|swipe|coordinate/i.test(name))).toBe(false)
  })

  it('keeps Android actions selector based without coordinate fields', () => {
    const action: AndroidAgentAction = { type: 'click', text: 'Search' }
    expect(action).not.toHaveProperty('x')
    expect(action).not.toHaveProperty('y')
    expect(action).not.toHaveProperty('path')
    expect(action).not.toHaveProperty('uri')
    expect(action).not.toHaveProperty('packageName')
  })
})
