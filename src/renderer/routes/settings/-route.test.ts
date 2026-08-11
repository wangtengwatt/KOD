import { describe, expect, it } from 'vitest'
import { getSettingsParentPath } from './-settings-navigation'

describe('getSettingsParentPath', () => {
  it.each([
    ['/settings/provider/openai', '/settings/provider'],
    ['/settings/provider/kod-ai', '/settings/provider'],
    ['/settings/provider/openai/', '/settings/provider'],
    ['/settings/provider', '/settings'],
    ['/settings/default-models', '/settings'],
    ['/settings/web-search/', '/settings'],
  ])('returns the structural parent for %s', (pathname, expected) => {
    expect(getSettingsParentPath(pathname)).toBe(expected)
  })

  it.each(['/settings', '/settings/', '/', '/about'])('does not invent a parent for %s', (pathname) => {
    expect(getSettingsParentPath(pathname)).toBeUndefined()
  })
})
