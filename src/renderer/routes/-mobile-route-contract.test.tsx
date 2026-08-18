// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { routeTree } from '@/routeTree.gen'

function jsxElementPositions(file: string, elementName: string): number[] {
  const source = readFileSync(resolve(process.cwd(), file), 'utf8')
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const positions: number[] = []

  function visit(node: ts.Node) {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(tree) === elementName
    ) {
      positions.push(node.getStart(tree))
    }
    ts.forEachChild(node, visit)
  }

  visit(tree)
  return positions
}

describe('mobile route contract', () => {
  it('registers all five top-level destinations', () => {
    const rootChildren = routeTree.children as unknown as Record<string, { options: { path?: string } }>
    const registeredPaths = Object.values(rootChildren).map((route) => route.options.path?.replace(/\/$/, '') || '/')

    expect(registeredPaths).toEqual(
      expect.arrayContaining(['/', '/image-creator', '/video-creator', '/compute-center', '/mobile-my'])
    )
  })

  it.each(['src/renderer/routes/index.tsx', 'src/renderer/routes/session/$sessionId.tsx'])(
    '%s keeps exactly one relay/node selector group directly above its input',
    (file) => {
      const selectorPositions = jsxElementPositions(file, 'RelayStationSelector')
      const inputPositions = jsxElementPositions(file, 'InputBox')

      expect(selectorPositions).toHaveLength(1)
      expect(inputPositions).toHaveLength(1)
      expect(selectorPositions[0]).toBeLessThan(inputPositions[0])
    }
  )
})
