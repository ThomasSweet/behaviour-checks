import type { ElementHandle, Frame, Locator, Page } from '@playwright/test'

import type { CheckContext, FoundElement } from './types.js'

export function engineOf(page: Page) {
  return page.context().browser()?.browserType().name() ?? 'unknown'
}

export function contextOf(page: Page): CheckContext {
  const browser = page.context().browser()
  const size = page.viewportSize()
  return {
    engine: browser?.browserType().name() ?? 'unknown',
    version: browser?.version() ?? 'unknown',
    viewport: size ? [size.width, size.height] : null,
  }
}

export function tabKey(page: Page, backwards = false) {
  const key = backwards ? 'Shift+Tab' : 'Tab'
  return engineOf(page) === 'webkit' ? `Alt+${key}` : key
}

export async function frameOf(page: Page, handle: ElementHandle | null | undefined) {
  return (await handle?.ownerFrame()) ?? page.mainFrame()
}

export async function rootsOf(page: Page, within: Locator | undefined, timeout = 5000) {
  if (!within) {
    const root = await page.locator(':root').elementHandle()
    return root ? [root] : []
  }
  try {
    await within.first().waitFor({ state: 'attached', timeout })
  } catch {
    throw new Error(`within matched no element after ${timeout}ms: ${within}`)
  }
  return within.elementHandles()
}

export async function focusSettled(frame: Frame, timeout = 2000) {
  let last = ''
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const now = await frame.evaluate(() => {
      const box = document.activeElement?.getBoundingClientRect()
      return `${scrollX} ${scrollY} ${box?.top} ${box?.left}`
    })
    if (now === last) return
    last = now
    await frame.waitForTimeout(50)
  }
}

export async function animationsSettled(frame: Frame, timeout = 3000) {
  await frame.evaluate(async (limit) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await frame()
    const finite = document
      .getAnimations()
      .filter((animation) => animation.playState === 'running' && animation.timeline === document.timeline)
      .filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime ?? Infinity)))
    await Promise.race([
      Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, limit)),
    ])
    await frame()
  }, timeout)
}

export function isActiveInPage(element: Node) {
  let active = element.ownerDocument?.activeElement ?? null
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active === element
}

export async function focusOn(handle: ElementHandle) {
  await handle.focus().catch(() => undefined)
  return handle.evaluate(isActiveInPage).catch(() => false)
}

export function describeInPage(element: Node): FoundElement {
  if (!(element instanceof Element)) return { selector: '', label: '' }
  const part = (node: Element) => {
    if (node.id) return `#${CSS.escape(node.id)}`
    const name = node.localName
    const first = typeof node.className === 'string' ? node.className.trim().split(/\s+/)[0] : ''
    const base = first ? `${name}.${CSS.escape(first)}` : name
    const siblings = node.parentElement ? [...node.parentElement.children].filter((sibling) => sibling.localName === name) : []
    return siblings.length > 1 ? `${base}:nth-of-type(${siblings.indexOf(node) + 1})` : base
  }
  const parts: string[] = []
  for (let node: Element | null = element; node && node !== document.documentElement && parts.length < 4; node = node.parentElement) {
    parts.unshift(part(node))
    if (node.id) break
  }
  const found = element.getRootNode()
  const root = found instanceof Document || found instanceof ShadowRoot ? found : element.ownerDocument
  const byIds = (ids: string | null) =>
    (ids ?? '')
      .split(/\s+/)
      .map((id) => (id ? root.getElementById(id)?.textContent ?? '' : ''))
      .join(' ')
      .trim()
  const labels = 'labels' in element ? (element as HTMLInputElement).labels : null
  const text =
    element.getAttribute('aria-label') ||
    byIds(element.getAttribute('aria-labelledby')) ||
    labels?.[0]?.textContent ||
    element.textContent ||
    element.getAttribute('title') ||
    element.getAttribute('placeholder') ||
    ''
  return { selector: parts.join(' > '), label: text.trim().replace(/\s+/g, ' ').slice(0, 60) }
}

export function describe(handle: ElementHandle) {
  return handle.evaluate(describeInPage)
}
