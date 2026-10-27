import type { ElementHandle, Frame, Locator, Page } from '@playwright/test'

import { animationsSettled, contextOf, describe, engineOf, focusOn, frameOf, rootsOf } from './page.js'
import type { Finding, Severity } from './types.js'

const invokers = '[aria-expanded], button[popovertarget], input[popovertarget], button[commandfor]'

export interface ExpandedStateOptions {
  within?: Locator
}

interface Reading {
  reported: boolean | null
  stated: boolean | null
  native: boolean | null
  visible: boolean | null
  target: string
  activatable: boolean
  tabStop: boolean
  inComposite: boolean
}

type Activation = 'Enter' | 'Space' | 'click'

function readInPage({ elements, restore }: { elements: Element[]; restore: (boolean | null)[] | null }) {
  const composite =
    '[role="toolbar"], [role="menubar"], [role="menu"], [role="grid"], [role="treegrid"], [role="tablist"], [role="tree"], [role="listbox"], [role="radiogroup"]'
  const shown = (node: Element) => {
    if (!node.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false
    if (getComputedStyle(node).display === 'inline') {
      return [...node.getClientRects()].some((box) => box.width > 0 && box.height > 0)
    }
    return node.clientWidth > 0 && node.clientHeight > 0
  }

  return elements.map((element, index): Reading | null => {
    if (!element.isConnected) return null
    const root = element.getRootNode() as Document | ShadowRoot
    const byId = (id: string | null | undefined) =>
      id ? (root.getElementById(id) ?? element.ownerDocument.getElementById(id)) : null
    const button = element as HTMLButtonElement & { commandForElement?: Element | null }
    const popoverCommand = ['toggle-popover', 'show-popover', 'hide-popover'].includes(element.getAttribute('command') ?? '')
    const controlled =
      (element.getAttribute('aria-controls') ?? '')
        .split(/\s+/)
        .map(byId)
        .find((node) => node) ?? null
    const popover = element.hasAttribute('popovertarget')
      ? (button.popoverTargetElement ?? byId(element.getAttribute('popovertarget')))
      : null
    const commanded = element.hasAttribute('commandfor')
      ? (button.commandForElement ?? byId(element.getAttribute('commandfor')))
      : null
    const parent = element.parentElement
    const details =
      element.localName === 'summary' &&
      parent instanceof HTMLDetailsElement &&
      parent.querySelector(':scope > summary') === element
        ? parent
        : null
    const target = controlled ?? popover ?? commanded ?? details

    const candidate = popover ?? (popoverCommand ? commanded : null)
    const nativeTarget =
      candidate instanceof HTMLElement && candidate.hasAttribute('popover') && !candidate.contains(element)
        ? candidate
        : null
    const wanted = restore?.[index] ?? null
    if (wanted !== null) {
      try {
        if (details && details.open !== wanted) details.open = wanted
        if (nativeTarget && nativeTarget.matches(':popover-open') !== wanted) {
          if (wanted) nativeTarget.showPopover()
          else nativeTarget.hidePopover()
        }
      } catch {}
    }
    const native = details ? details.open : nativeTarget ? nativeTarget.matches(':popover-open') : null
    const attribute = element.getAttribute('aria-expanded')
    const stated = attribute === 'true' || attribute === 'false' ? attribute === 'true' : null

    const visible = !target ? null : target === details ? details.open && shown(details) : shown(target)
    const role = element.getAttribute('role')
    const formAction =
      (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) &&
      element.form !== null &&
      ['submit', 'reset', 'image'].includes(element.type)
    const buttonLike =
      element instanceof HTMLButtonElement
        ? true
        : element instanceof HTMLInputElement
          ? element.type === 'button'
          : element.localName === 'summary' ||
            (role === 'button' && !(element instanceof HTMLAnchorElement && element.hasAttribute('href')))
    const disabled = element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true'

    return {
      reported: native ?? stated,
      stated,
      native,
      visible,
      target: target ? (target.id ? `#${target.id}` : `the ${target.localName} it controls`) : '',
      activatable: buttonLike && !formAction && !disabled && !element.closest('[inert]') && shown(element),
      tabStop: element instanceof HTMLElement && element.tabIndex >= 0,
      inComposite: element.closest(composite) !== null,
    }
  })
}

function says(reported: boolean | null) {
  return reported ? 'reports expanded' : 'reports collapsed'
}

function same(a: Reading | null, b: Reading | null) {
  return !a || !b || (a.reported === b.reported && a.visible === b.visible)
}

function mismatch(reading: Reading, when: string) {
  if (reading.visible === null || reading.reported === null || reading.reported === reading.visible) return null
  return `${says(reading.reported)} while its target ${reading.target} is ${reading.visible ? 'visible' : 'hidden'}, ${when}`
}

async function chromiumExpanded(page: Page, handle: ElementHandle) {
  const session = await page.context().newCDPSession(page)
  try {
    await handle.evaluate((element) => (element as Element).setAttribute('data-behaviour-checks-probe', ''))
    const { root } = await session.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '[data-behaviour-checks-probe]',
    })
    const { nodes } = await session.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    const value = nodes[0]?.properties?.find((property) => property.name === 'expanded')?.value.value
    return typeof value === 'boolean' ? value : null
  } catch {
    return null
  } finally {
    await handle.evaluate((element) => (element as Element).removeAttribute('data-behaviour-checks-probe')).catch(() => undefined)
    await session.detach().catch(() => undefined)
  }
}

export async function findExpandedStateMismatches(page: Page, options: ExpandedStateOptions = {}) {
  const roots = await rootsOf(page, options.within)
  const handles = (await Promise.all(roots.map((root) => root.$$(invokers)))).flat()
  const frame: Frame = await frameOf(page, handles[0])
  const context = contextOf(page)
  const chromium = engineOf(page) === 'chromium' && frame === page.mainFrame()
  const findings: Finding[] = []

  const readAll = (restore: (boolean | null)[] | null = null) =>
    frame.evaluate(readInPage, { elements: handles as ElementHandle<Element>[], restore })
  const read = async (handle: ElementHandle) =>
    (await frame.evaluate(readInPage, { elements: [handle as ElementHandle<Element>], restore: null }).catch(() => [null]))[0]

  const press = async (handle: ElementHandle, how: Activation) => {
    if (how === 'click') {
      const clicked = await handle.click({ timeout: 2000 }).then(
        () => true,
        () => false,
      )
      await animationsSettled(frame)
      return clicked
    }
    if (!(await focusOn(handle))) return false
    await page.keyboard.press(how)
    await animationsSettled(frame)
    return true
  }

  const activate = async (handle: ElementHandle, before: Reading) => {
    const focused = await focusOn(handle)
    if (focused) {
      for (const how of ['Enter', 'Space'] as const) {
        if (!(await press(handle, how))) break
        const now = await read(handle)
        if (!same(now, before)) return { how, after: now, focused }
      }
    }
    await press(handle, 'click')
    const now = await read(handle)
    return { how: same(now, before) ? null : ('click' as const), after: now, focused }
  }

  const report = async (handle: ElementHandle, severity: Severity, criteria: string[], what: string) => {
    findings.push({ check: 'expanded-state', severity, criteria, element: await describe(handle), what, context })
  }

  const assess = async (handle: ElementHandle, reading: Reading, when: string) => {
    const wrong = mismatch(reading, when)
    if (wrong) {
      await report(handle, 'failure', ['4.1.2'], wrong)
      return true
    }
    if (reading.native === null) return false
    const tree = chromium ? await chromiumExpanded(page, handle) : null
    const state = `its target ${reading.target} is ${reading.native ? 'open' : 'closed'}, ${when}`

    if (reading.stated !== null && reading.stated !== reading.native) {
      const where = `its aria-expanded attribute ${says(reading.stated)} while ${state}`
      if (tree === reading.stated) {
        await report(handle, 'failure', ['4.1.2'], `${where}, and the browser's accessibility tree follows the attribute`)
      } else if (tree === reading.native) {
        await report(
          handle,
          'warning',
          ['4.1.2'],
          `${where}. Chromium's accessibility tree ignores the attribute and follows the native state; other engines may not, so remove it`,
        )
      } else {
        await report(
          handle,
          'warning',
          ['4.1.2'],
          `${where}. A native invoker carries its own state, and this engine's accessibility tree cannot be read here, so remove the attribute`,
        )
      }
      return true
    }

    if (tree !== null && tree !== reading.native) {
      await report(handle, 'warning', [], `the browser's accessibility tree ${says(tree)} while ${state}: the browser's mapping, not the page's`)
      return true
    }
    return false
  }

  const startFocus = await frame.evaluateHandle(() => document.activeElement)
  const snapshot = await readAll()
  const wanted = snapshot.map((reading) => reading?.native ?? null)

  const restore = async () => {
    let now = await readAll(wanted)
    if (now.every((reading, index) => same(reading, snapshot[index]))) return
    await page.keyboard.press('Escape')
    await animationsSettled(frame)
    now = await readAll(wanted)
    for (const [index, handle] of handles.entries()) {
      const reading = now[index]
      if (same(reading, snapshot[index]) || !reading?.activatable) continue
      if (!(await press(handle, 'Enter'))) await press(handle, 'click')
    }
  }

  for (const [index, handle] of handles.entries()) {
    const rest = await read(handle)
    if (!rest || rest.reported === null || !snapshot[index]) continue
    if (await assess(handle, rest, 'at rest')) continue
    if (!rest.activatable) continue

    const { how, after, focused } = await activate(handle, rest)
    if (after && how === null) {
      await report(
        handle,
        'warning',
        ['4.1.2'],
        rest.target
          ? `pressing Enter or Space and clicking changed neither its state nor its target ${rest.target}`
          : 'pressing Enter or Space and clicking did not change its state, and it names no target to compare with',
      )
    } else if (after && how) {
      if (how === 'click') {
        await report(
          handle,
          'failure',
          ['2.1.1'],
          focused
            ? 'Enter and Space changed nothing, a click did: only a pointer operates it'
            : 'it cannot take focus, so the keyboard cannot reach it; a click operates it',
        )
      } else if (!rest.tabStop && !rest.inComposite) {
        await report(
          handle,
          'failure',
          ['2.1.1'],
          `${how} operates it, but it is not a tab stop and sits in no widget that moves focus with arrow keys, so the keyboard cannot reach it`,
        )
      }
      const reported = await assess(handle, after, `after ${how}`)
      const again = (await press(handle, how)) ? await read(handle) : null
      if (!reported && again) await assess(handle, again, `after a second ${how}`)
    }
    await restore()
  }

  await frame
    .evaluate((element) => {
      if (element instanceof HTMLElement && element !== document.body) element.focus()
      else (document.activeElement as HTMLElement | null)?.blur()
    }, startFocus)
    .catch(() => undefined)
  for (const handle of handles) await handle.dispose()
  return findings
}
