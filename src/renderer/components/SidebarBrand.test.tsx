// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { SidebarBrand } from './SidebarBrand'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('sidebar KAI brand', () => {
  it('renders the KAI wordmark and version while preserving About navigation', () => {
    const onAbout = vi.fn()
    render(
      <MantineProvider>
        <SidebarBrand version="0.0.1" onAbout={onAbout} />
      </MantineProvider>
    )

    expect(screen.getByAltText('KAI')).toBeTruthy()
    expect(screen.getByText('0.0.1')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: '前往关于 KAI' }))
    expect(onAbout).toHaveBeenCalledTimes(1)
  })
})
