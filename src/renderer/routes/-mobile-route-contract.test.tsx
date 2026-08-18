// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { routeTree } from '@/routeTree.gen'

function parseTsx(file: string) {
  const source = readFileSync(resolve(process.cwd(), file), 'utf8')
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function jsxElements(tree: ts.SourceFile, elementName: string): ts.JsxOpeningLikeElement[] {
  const elements: ts.JsxOpeningLikeElement[] = []

  function visit(node: ts.Node) {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(tree) === elementName
    ) {
      elements.push(node)
    }
    ts.forEachChild(node, visit)
  }

  visit(tree)
  return elements
}

function meaningfulChildren(parent: ts.JsxElement) {
  return parent.children.filter(
    (child) =>
      (!ts.isJsxText(child) || child.getText().trim() !== '') &&
      (!ts.isJsxExpression(child) || child.expression !== undefined)
  )
}

function lowestCommonJsxParent(first: ts.Node, second: ts.Node) {
  const firstAncestors = new Set<ts.Node>()
  for (let node: ts.Node | undefined = first; node; node = node.parent) firstAncestors.add(node)
  for (let node: ts.Node | undefined = second; node; node = node.parent) {
    if (ts.isJsxElement(node) && firstAncestors.has(node)) return node
  }
  throw new Error('Expected selector and input to share a JSX parent')
}

function childUnder(target: ts.Node, parent: ts.JsxElement) {
  let child = target
  while (child.parent && child.parent !== parent) child = child.parent
  if (child.parent !== parent) throw new Error('Target is not contained by the expected JSX parent')
  return child as ts.JsxChild
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
      const tree = parseTsx(file)
      const selectors = jsxElements(tree, 'RelayStationSelector')
      const inputs = jsxElements(tree, 'InputBox')

      expect(selectors).toHaveLength(1)
      expect(inputs).toHaveLength(1)

      const commonParent = lowestCommonJsxParent(selectors[0], inputs[0])
      const selectorChild = childUnder(selectors[0], commonParent)
      const inputChild = childUnder(inputs[0], commonParent)
      const siblings = meaningfulChildren(commonParent)
      expect(siblings.indexOf(inputChild) - siblings.indexOf(selectorChild)).toBe(1)
    }
  )

  it('mounts the bottom navigation from root only when the platform is mobile', () => {
    const tree = parseTsx('src/renderer/routes/__root.tsx')
    const navigation = jsxElements(tree, 'MobileBottomNavigation')
    expect(navigation).toHaveLength(1)

    let child: ts.Node = navigation[0]
    while (child.parent && !ts.isBinaryExpression(child.parent)) child = child.parent

    expect(child.parent && ts.isBinaryExpression(child.parent)).toBe(true)
    expect(child.parent?.getText(tree)).toContain("platform.type === 'mobile'")
  })
})
