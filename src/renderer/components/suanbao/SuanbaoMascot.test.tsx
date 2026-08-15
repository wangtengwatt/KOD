import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SuanbaoMascot } from './SuanbaoMascot'

describe('SuanbaoMascot', () => {
  it('renders the shared brand asset with state and animation classes', () => {
    const markup = renderToStaticMarkup(<SuanbaoMascot state="executing" animation="reduced" />)

    expect(markup).toContain('suanbao-mascot-state-executing')
    expect(markup).toContain('suanbao-mascot-animation-reduced')
    expect(markup).toContain('suanbao-mascot.png')
    expect(markup).toContain('draggable="false"')
    expect(markup).toContain('alt=""')
  })
})
