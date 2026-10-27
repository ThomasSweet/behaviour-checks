import type { ElementHandle, JSHandle, Locator } from '@playwright/test'

import { animationsSettled, contextOf, describe, focusOn, focusSettled, frameOf, isActiveInPage, tabKey } from './page.js'
import type { Finding, Severity } from './types.js'

export interface ModalWalkOptions {
  close?: Locator
  returnTo?: Locator
  presses?: number
}

type Place = 'inside' | 'none' | 'behind' | 'closed'

const dialogs = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], [popover]'

const awayLimit = 20

function shownDialogs(selector: string) {
  const shown = (node: Element) =>
    node.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
    [...node.getClientRects()].some((box) => box.width > 0 && box.height > 0)
  return [...document.querySelectorAll(selector)].filter(shown)
}

function findDialog({ opener, before, selector }: { opener: Element; before: Element[]; selector: string }) {
  const shown = (node: Element | null | undefined): node is Element =>
    !!node &&
    node.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
    [...node.getClientRects()].some((box) => box.width > 0 && box.height > 0)
  const root = opener.getRootNode() as Document | ShadowRoot
  const byId = (id: string) => (id ? (root.getElementById(id) ?? document.getElementById(id)) : null)
  const button = opener as HTMLButtonElement & { commandForElement?: Element | null }
  const named = [
    button.commandForElement,
    button.popoverTargetElement,
    ...(opener.getAttribute('aria-controls') ?? '').split(/\s+/).map(byId),
  ]
  const explicit = named.find(shown)
  if (explicit) return explicit
  const modal = [...document.querySelectorAll('dialog:modal')].filter((node) => !before.includes(node)).at(-1)
  if (modal) return modal
  return [...document.querySelectorAll(selector)].filter((node) => shown(node) && !before.includes(node)).at(-1) ?? null
}

function placeOf(dialog: Element): Place {
  const open =
    dialog.isConnected &&
    dialog.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
    [...dialog.getClientRects()].some((box) => box.width > 0 && box.height > 0)
  if (!open) return 'closed'
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  if (!active || active === document.body || active === document.documentElement) return 'none'
  for (let node: Node | null = active; node; node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null)) {
    if (node === dialog) return 'inside'
  }
  return 'behind'
}

function isModal(dialog: Element) {
  return dialog.matches('dialog:modal') || dialog.getAttribute('aria-modal') === 'true'
}

function focusFirst(dialog: Element) {
  const tabbable =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [tabindex], [contenteditable]'
  const stops: HTMLElement[] = []
  const collect = (root: Element | ShadowRoot) => {
    for (const node of root.querySelectorAll<HTMLElement>('*')) {
      if (node.matches(tabbable) && node.tabIndex >= 0 && !node.matches(':disabled') && node.checkVisibility()) stops.push(node)
      if (node.shadowRoot) collect(node.shadowRoot)
    }
  }
  collect(dialog)
  stops[0]?.focus()
  return stops.length
}

async function wait(until: () => Promise<boolean>, timeout = 1000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await until()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return until()
}

export async function walkModal(opener: Locator, options: ModalWalkOptions = {}) {
  const page = opener.page()
  const context = contextOf(page)
  const findings: Finding[] = []
  const report = async (handle: ElementHandle, severity: Severity, criteria: string[], what: string) => {
    findings.push({ check: 'modal-walk', severity, criteria, element: await describe(handle), what, context })
  }

  const openerHandle = await opener.elementHandle()
  if (!openerHandle) return findings
  const frame = await frameOf(page, openerHandle)

  const activeLabel = async () => {
    const active = await frame.evaluateHandle(() => {
      let node = document.activeElement
      while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement
      return node
    })
    const element = active.asElement()
    if (!element) return 'nothing'
    const isBody = await element.evaluate((node) => node === document.body || node === document.documentElement)
    if (isBody) return 'the page body'
    const { selector, label } = await describe(element)
    return label ? `${selector} "${label}"` : selector
  }

  const before = await frame.evaluateHandle(shownDialogs, dialogs)
  const locateDialog = async () => {
    const found: JSHandle = await frame.evaluateHandle(findDialog, { opener: openerHandle as ElementHandle<Element>, before, selector: dialogs })
    return found.asElement()
  }

  const focusable = await focusOn(openerHandle)
  let dialog: ElementHandle | null = null
  if (focusable) {
    await page.keyboard.press('Enter')
    await animationsSettled(frame)
    dialog = await locateDialog()
  }
  if (!dialog) {
    await openerHandle.click({ timeout: 2000 }).catch(() => undefined)
    await animationsSettled(frame)
    dialog = await locateDialog()
    if (!dialog) {
      await report(openerHandle, 'failure', [], 'neither Enter nor a click opened anything that looks like a dialog')
      return findings
    }
    await report(
      openerHandle,
      'failure',
      ['2.1.1'],
      focusable ? 'Enter on the opener opened nothing, a click did' : 'the opener cannot take focus; a click opened the dialog',
    )
  }

  const modal = await dialog.evaluate(isModal)
  const escape = async (what: string) => {
    if (modal) await report(dialog, 'failure', ['2.4.3'], what)
    else
      await report(
        dialog,
        'failure',
        [],
        `${what}. It is not modal (no showModal(), no aria-modal), and WCAG allows this for a dialog that follows its opener in the focus order, so this fails only the behaviour the check asks for`,
      )
  }

  const movedIn = await wait(async () => (await dialog.evaluate(placeOf)) === 'inside')
  if (!movedIn) await escape(`focus stayed outside the dialog when it opened, on ${await activeLabel()}`)

  const stops = await dialog.evaluate(focusFirst)
  const presses = options.presses ?? Math.min(100, Math.max(3, stops + 2))

  for (const backwards of [false, true]) {
    const key = tabKey(page, backwards)
    let away = 0
    if ((await dialog.evaluate(placeOf)) !== 'inside') await dialog.evaluate(focusFirst)
    for (let press = 0; press < presses || (away > 0 && away < awayLimit); press++) {
      await page.keyboard.press(key)
      await focusSettled(frame)
      const place = await dialog.evaluate(placeOf)
      if (place === 'closed') {
        await report(dialog, 'failure', modal ? ['2.4.3'] : [], `the dialog closed when ${key} moved focus`)
        return findings
      }
      if (place === 'behind') {
        await escape(`${key} moved focus out of the dialog to ${await activeLabel()} on the page behind it`)
        break
      }
      away = place === 'none' ? away + 1 : 0
    }
    if (away >= awayLimit) {
      await report(dialog, 'warning', ['2.4.3'], `${key} took focus off the page and ${awayLimit} presses did not bring it back into the dialog`)
    }
  }

  if ((await dialog.evaluate(placeOf)) !== 'inside') await dialog.evaluate(focusFirst)
  await page.keyboard.press('Escape')
  await animationsSettled(frame)
  if ((await dialog.evaluate(placeOf)) !== 'closed') {
    await report(dialog, 'warning', ['2.1.2'], 'Escape does not close it. If no control inside closes it either, focus is trapped')
    const close = options.close ? await options.close.elementHandle() : null
    if (!close) return findings
    if (await focusOn(close)) {
      await page.keyboard.press('Enter')
      await animationsSettled(frame)
    }
    if ((await dialog.evaluate(placeOf)) !== 'closed') {
      await report(dialog, 'failure', ['2.1.2'], 'neither Escape nor the named close control closes it')
      return findings
    }
  }

  const expected = options.returnTo ? await options.returnTo.elementHandle() : openerHandle
  const returned = await wait(async () => (await expected?.evaluate(isActiveInPage)) ?? false)
  if (!returned) {
    await report(
      openerHandle,
      'failure',
      ['2.4.3'],
      `focus went to ${await activeLabel()} when the dialog closed, not back to ${options.returnTo ? 'the element named in returnTo' : 'the opener'}`,
    )
  }
  await before.dispose()
  return findings
}
