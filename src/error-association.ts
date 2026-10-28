import type { Locator, Page } from '@playwright/test'

import { defined } from './codes.js'
import { contextOf, describe, rootsOf } from './page.js'
import type { CodeOf, Finding } from './types.js'

export interface ErrorAssociationOptions {
  within?: Locator
  errors?: string
}

interface Problem {
  element: Element
  code: CodeOf<'error-association'>
  what: string
}

const defaultErrors = '[id*="error" i], [class*="error" i], [role="alert"]'

function findProblemsInPage(root: Element, errorsSelector: string) {
  const fieldSelector = [
    'input:not([type="hidden"], [type="submit"], [type="button"], [type="reset"], [type="image"])',
    'select',
    'textarea',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="spinbutton"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="radiogroup"]',
    '[role="switch"]',
    '[role="slider"]',
  ].join(', ')
  const containers = '[role="radiogroup"], [role="group"]'
  const landmarks = 'body, main, header, footer, nav, aside, [role="main"], [role="banner"], [role="contentinfo"], [role="navigation"], [role="complementary"]'
  const edges =
    'form, fieldset, search, section, article, dialog, [role="dialog"], [role="alertdialog"], [role="form"], [role="search"], [role="region"]'
  const notHeadings = 'h1, h2, h3, h4, h5, h6, [role="heading"]'

  const shown = (node: Element) =>
    node.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
    [...node.getClientRects()].some((box) => box.width > 0 && box.height > 0)
  const fieldShown = (node: Element) => node.checkVisibility({ visibilityProperty: true })
  const text = (node: Element) => (node.textContent ?? '').trim().replace(/\s+/g, ' ')
  const quote = (node: Element) => `"${text(node).slice(0, 60)}"`
  const ids = (node: Element, attribute: string) => (node.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)
  const byId = (node: Element, id: string) =>
    (node.getRootNode() as Document | ShadowRoot).getElementById(id) ?? document.getElementById(id)
  const invalid = (node: Element) => {
    const stated = node.getAttribute('aria-invalid')
    return stated !== null && stated !== '' && stated !== 'false'
  }
  const namersOf = (field: Element) => [
    ...('labels' in field ? [...((field as HTMLInputElement).labels ?? [])] : []),
    ...ids(field, 'aria-labelledby').map((id) => byId(field, id)),
  ].filter((node) => node !== null)

  const problems = new Map<Element, Omit<Problem, 'element'>>()

  for (const field of root.querySelectorAll(fieldSelector)) {
    if (!fieldShown(field) || !invalid(field)) continue
    const holders = [field, field.closest('fieldset, [role="group"], [role="radiogroup"]')].filter((node) => node !== null)
    const described = holders
      .flatMap((holder) => [...ids(holder, 'aria-errormessage'), ...ids(holder, 'aria-describedby')])
      .map((id) => byId(field, id))
      .filter((node) => node !== null)
    const named = namersOf(field).flatMap((namer) => [...namer.querySelectorAll(errorsSelector)])
    const said = [...described, ...named].filter((node) => text(node))
    if (said.length === 0) {
      problems.set(
        field,
        described.length
          ? { code: 'error-association/tied-message-is-empty', what: 'it is marked invalid, and the message tied to it is empty' }
          : { code: 'error-association/invalid-field-has-no-message', what: 'it is marked invalid, but no error message is tied to it' },
      )
    } else if (!said.some(shown)) {
      problems.set(field, {
        code: 'error-association/tied-message-is-hidden',
        what: `it is marked invalid, and its message ${quote(said[0])} is tied to it but not shown on screen`,
      })
    }
  }

  const fields = [...document.querySelectorAll(fieldSelector)]
  const described = [...document.querySelectorAll('[aria-describedby], [aria-errormessage]')]
    .flatMap((holder) => [...ids(holder, 'aria-describedby'), ...ids(holder, 'aria-errormessage')].map((id) => byId(holder, id)))
    .filter((node) => node !== null)
  const named = fields.flatMap(namersOf)
  const tied = (message: Element) =>
    described.some(
      (node) => node === message || message.contains(node) || (node.contains(message) && !node.querySelector(fieldSelector)),
    ) || named.some((node) => node.contains(message))

  const candidates = [...root.querySelectorAll(errorsSelector)].filter(
    (node) =>
      shown(node) &&
      text(node) &&
      !node.matches(`${fieldSelector}, ${notHeadings}, form, fieldset, label, legend`) &&
      !node.querySelector(fieldSelector) &&
      !node.querySelector('a[href]'),
  )
  const messages = candidates.filter((node) => !candidates.some((other) => other !== node && node.contains(other)))

  for (const message of messages) {
    if (tied(message)) continue
    let group: Element[] = []
    for (let node = message.parentElement; node && !node.matches(landmarks); node = node.parentElement) {
      const found = [...node.querySelectorAll(fieldSelector)].filter((field) => fieldShown(field) && !field.matches(containers))
      if (found.length) {
        const names = new Set(found.map((field) => field.getAttribute('name') ?? field))
        group = names.size === 1 ? found : []
        break
      }
      if (node === root || node.matches(edges)) break
    }
    const field = group[0]
    if (!field) continue
    problems.set(field, {
      code: 'error-association/visible-error-is-not-tied',
      what: invalid(field)
        ? `it is marked invalid, and the error ${quote(message)} next to it is not tied to it (aria-describedby or aria-errormessage)`
        : `the error ${quote(message)} is shown next to it but not tied to it (aria-describedby or aria-errormessage)`,
    })
  }

  return [...problems].map(([element, problem]) => ({ element, ...problem }))
}

export async function findUntiedErrors(page: Page, options: ErrorAssociationOptions = {}) {
  const roots = await rootsOf(page, options.within)
  const context = contextOf(page)
  const findings: Finding[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    const problems = await root.evaluateHandle(findProblemsInPage, options.errors ?? defaultErrors)
    const count = await problems.evaluate((list) => list.length)
    for (let index = 0; index < count; index++) {
      const element = (await problems.evaluateHandle((list, at) => list[at].element, index)).asElement()
      const { code, what } = await problems.evaluate((list, at): Omit<Problem, 'element'> => {
        const { code, what } = list[at]
        return { code, what }
      }, index)
      if (!element) continue
      const found = await describe(element)
      if (seen.has(`${found.selector} ${what}`)) continue
      seen.add(`${found.selector} ${what}`)
      findings.push({ check: 'error-association', code, ...defined(code), element: found, what, context })
    }
    await problems.dispose()
  }
  return findings
}
