import type { ElementHandle, JSHandle, Locator } from '@playwright/test'

import { defined } from './codes.js'
import { animationsSettled, contextOf, describe, focusOn, focusSettled, frameOf, isActiveInPage, tabKey } from './page.js'
import type { CodeOf, Finding } from './types.js'

export interface ModalWalkOptions {
  close?: Locator
  returnTo?: Locator
  presses?: number
}

type Place = 'inside' | 'away' | 'blank' | 'dropped' | 'behind' | 'closed'

interface Recorder {
  found: { node: Element; outsideModal: boolean; inert: boolean }[]
  changed: boolean
  stray: Element | null
  stop: () => void
}

const dialogs = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], [popover]'

const awayLimit = 20

const runLimit = 100

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

function startRecorder(dialog: Element) {
  const parentOf = (node: Node): Node | null =>
    (node instanceof Element ? node.assignedSlot : null) ?? node.parentNode ?? (node instanceof ShadowRoot ? node.host : null)
  const holds = (container: Node, node: Node) => {
    for (let at: Node | null = node; at; at = parentOf(at)) if (at === container) return true
    return false
  }
  const blockerOf = () => {
    for (let at: Node | null = dialog; at; at = parentOf(at)) if (at instanceof Element && at.matches('dialog:modal')) return at
    return null
  }
  const inert = (node: Element) => {
    if (getComputedStyle(node).getPropertyValue('interactivity') === 'inert') return true
    for (let at: Node | null = node; at; at = parentOf(at)) if (at instanceof Element && at.hasAttribute('inert')) return true
    return false
  }
  const observer = new MutationObserver(() => {
    recorder.changed = true
  })
  const watched = new Set<Node>()
  const watch = (root: Document | ShadowRoot) => {
    if (watched.has(root)) return
    watched.add(root)
    observer.observe(root, { attributes: true, attributeFilter: ['inert', 'class', 'style'], subtree: true })
    for (const node of root.querySelectorAll('*')) if (node.shadowRoot) watch(node.shadowRoot)
  }
  const recorder: Recorder = {
    found: [],
    changed: false,
    stray: null,
    stop: () => {
      removeEventListener('focus', listen, true)
      removeEventListener('focusin', listen, true)
      observer.disconnect()
    },
  }
  function listen(event: Event) {
    if (!event.isTrusted) return
    const target = event.composedPath()[0]
    if (!(target instanceof Element) || recorder.found.some((entry) => entry.node === target)) return
    for (let root = target.getRootNode(); root instanceof ShadowRoot; root = root.host.getRootNode()) watch(root)
    const blocker = blockerOf()
    recorder.found.push({ node: target, outsideModal: blocker !== null && !holds(blocker, target), inert: inert(target) })
  }
  watch(document)
  addEventListener('focus', listen, true)
  addEventListener('focusin', listen, true)
  return recorder
}

function placeOf(dialog: Element, recorder?: Recorder | null | void): Place {
  const open =
    dialog.isConnected &&
    dialog.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
    [...dialog.getClientRects()].some((box) => box.width > 0 && box.height > 0)
  if (!open) return 'closed'
  const parentOf = (node: Node): Node | null =>
    (node instanceof Element ? node.assignedSlot : null) ?? node.parentNode ?? (node instanceof ShadowRoot ? node.host : null)
  const holds = (container: Node, node: Node) => {
    for (let at: Node | null = node; at; at = parentOf(at)) if (at === container) return true
    return false
  }
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  if (active && active !== document.body && active !== document.documentElement) {
    return holds(dialog, active) || (active.matches('dialog:modal') && holds(active, dialog)) ? 'inside' : 'behind'
  }
  if (!recorder || !document.hasFocus()) return 'away'
  const stray = recorder.found.find(({ node }) => !holds(dialog, node))
  if (!stray) return 'away'
  recorder.stray = stray.node
  return stray.outsideModal || (stray.inert && !recorder.changed) ? 'blank' : 'dropped'
}

function isModal(dialog: Element) {
  return dialog.matches('dialog:modal') || dialog.getAttribute('aria-modal') === 'true'
}

function focusFirst(dialog: Element) {
  const tabbable =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [tabindex], [contenteditable]'
  const stops: HTMLElement[] = []
  const childrenOf = (node: Element) => {
    if (node instanceof HTMLSlotElement) {
      const assigned = node.assignedElements({ flatten: true })
      return assigned.length ? assigned : [...node.children]
    }
    return [...(node.shadowRoot ?? node).children]
  }
  const walk = (node: Element) => {
    if (node instanceof HTMLElement && node.matches(tabbable) && node.tabIndex >= 0 && !node.matches(':disabled') && node.checkVisibility()) {
      stops.push(node)
    }
    for (const child of childrenOf(node)) walk(child)
  }
  for (const child of childrenOf(dialog)) walk(child)
  stops[0]?.focus()
  return stops.length
}

function times(count: number) {
  return count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`
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
  const report = async (handle: ElementHandle, code: CodeOf<'modal-walk'>, what: string, wcag = true) => {
    findings.push({ check: 'modal-walk', code, ...defined(code, wcag), element: await describe(handle), what, context })
  }

  const openerHandle = await opener.elementHandle()
  if (!openerHandle) return findings
  const frame = await frameOf(page, openerHandle)

  const labelOf = async (handle: JSHandle) => {
    const element = handle.asElement()
    if (!element) return 'nothing'
    const isBody = await element.evaluate((node) => node === document.body || node === document.documentElement)
    if (isBody) return 'the page body'
    const { selector, label } = await describe(element)
    return label ? `${selector} "${label}"` : selector
  }
  const activeLabel = async () =>
    labelOf(
      await frame.evaluateHandle(() => {
        let node = document.activeElement
        while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement
        return node
      }),
    )

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
      await report(openerHandle, 'modal-walk/no-dialog-opens', 'neither Enter nor a click opened anything that looks like a dialog')
      return findings
    }
    if (focusable) await report(openerHandle, 'modal-walk/enter-does-not-open', 'Enter on the opener opened nothing, a click did')
    else await report(openerHandle, 'modal-walk/opener-cannot-take-focus', 'the opener cannot take focus; a click opened the dialog')
  }

  const modal = await dialog.evaluate(isModal)
  const escape = async (code: CodeOf<'modal-walk'>, what: string) => {
    if (modal) await report(dialog, code, what)
    else
      await report(
        dialog,
        code,
        `${what}. It is not modal (no showModal(), no aria-modal), and WCAG allows this for a dialog that follows its opener in the focus order, so this fails only the behaviour the check asks for`,
        false,
      )
  }

  const movedIn = await wait(async () => (await dialog.evaluate(placeOf)) === 'inside')
  if (!movedIn) await escape('modal-walk/focus-does-not-move-in', `focus stayed outside the dialog when it opened, on ${await activeLabel()}`)

  const stops = await dialog.evaluate(focusFirst)
  const presses = options.presses ?? Math.min(100, Math.max(3, stops + 2))

  const recorder = await dialog.evaluateHandle(startRecorder)
  const strayLabel = async () => labelOf(await recorder.evaluateHandle((log) => log.stray))
  const walkTabs = async () => {
    for (const backwards of [false, true]) {
      const key = tabKey(page, backwards)
      let run = 0
      let away = 0
      let blank = 0
      let stray = ''
      if ((await dialog.evaluate(placeOf)) !== 'inside') await dialog.evaluate(focusFirst)
      for (let press = 0; press < presses || (run > 0 && away < awayLimit && run < runLimit); press++) {
        await recorder.evaluate((log) => {
          log.found.length = 0
          log.changed = false
          log.stray = null
        })
        await page.keyboard.press(key)
        await focusSettled(frame)
        const place = await dialog.evaluate(placeOf, recorder)
        if (place === 'closed') {
          await report(dialog, 'modal-walk/tab-closes-dialog', `the dialog closed when ${key} moved focus`, modal)
          return false
        }
        if (place === 'behind') {
          await escape('modal-walk/tab-reaches-page-behind', `${key} moved focus out of the dialog to ${await activeLabel()} on the page behind it`)
          break
        }
        if (place === 'dropped') {
          await escape(
            'modal-walk/tab-reaches-page-behind',
            `${key} moved focus out of the dialog to ${await strayLabel()} on the page behind it, which then lost focus`,
          )
          break
        }
        if (place === 'blank') {
          blank++
          stray ||= await strayLabel()
        }
        run = place === 'inside' ? 0 : run + 1
        away = place === 'inside' ? 0 : place === 'away' ? away + 1 : away
      }
      const gaveUp = run >= runLimit
      if (blank) {
        await report(
          dialog,
          'modal-walk/blank-stop-behind-dialog',
          `${key} stopped ${gaveUp ? 'at least ' : ''}${times(blank)} in the page behind the dialog with nothing focused: ${stray} took focus and lost it at once. That element is inert, so this is a browser bug the page cannot fix, but a keyboard user still lands there${gaveUp ? `. After ${runLimit} presses focus had still not come back into the dialog, so the walk stopped there` : ''}`,
        )
      }
      if (away >= awayLimit) {
        await report(
          dialog,
          'modal-walk/focus-stays-off-page',
          `${key} took focus off the page and ${awayLimit} presses did not bring it back into the dialog`,
        )
      }
    }
    return true
  }
  const stillOpen = await walkTabs().finally(() => recorder.evaluate((log) => log.stop()).catch(() => undefined))
  await recorder.dispose()
  if (!stillOpen) return findings

  if ((await dialog.evaluate(placeOf)) !== 'inside') await dialog.evaluate(focusFirst)
  await page.keyboard.press('Escape')
  await animationsSettled(frame)
  if ((await dialog.evaluate(placeOf)) !== 'closed') {
    await report(dialog, 'modal-walk/escape-does-not-close', 'Escape does not close it. If no control inside closes it either, focus is trapped')
    const close = options.close ? await options.close.elementHandle() : null
    if (!close) return findings
    if (await focusOn(close)) {
      await page.keyboard.press('Enter')
      await animationsSettled(frame)
    }
    if ((await dialog.evaluate(placeOf)) !== 'closed') {
      await report(dialog, 'modal-walk/close-control-does-not-close', 'neither Escape nor the named close control closes it')
      return findings
    }
  }

  const expected = options.returnTo ? await options.returnTo.elementHandle() : openerHandle
  const returned = await wait(async () => (await expected?.evaluate(isActiveInPage)) ?? false)
  if (!returned) {
    await report(
      openerHandle,
      'modal-walk/focus-does-not-return',
      `focus went to ${await activeLabel()} when the dialog closed, not back to ${options.returnTo ? 'the element named in returnTo' : 'the opener'}`,
    )
  }
  await before.dispose()
  return findings
}
