import { expect as baseExpect, test, type ExpectMatcherState, type Locator, type Page } from '@playwright/test'

import { findUntiedErrors, type ErrorAssociationOptions } from './error-association.js'
import { findExpandedStateMismatches } from './expanded-state.js'
import { walkModal, type ModalWalkOptions } from './modal-walk.js'
import type { Finding } from './types.js'

export interface MatcherOptions {
  warnings?: 'report' | 'fail'
}

function isPage(received: Page | Locator): received is Page {
  return typeof (received as Page).goto === 'function'
}

function scope(received: Page | Locator) {
  return isPage(received) ? { page: received, within: undefined } : { page: received.page(), within: received }
}

function line(finding: Finding) {
  const { selector, label } = finding.element
  const criteria = finding.criteria.length ? ` (${finding.criteria.join(', ')})` : ''
  return `  - ${selector}${label ? ` "${label}"` : ''}: ${finding.what}${criteria} [${finding.code}]`
}

function counted(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function result(name: string, state: ExpectMatcherState, findings: Finding[], options: MatcherOptions) {
  const failures = findings.filter((finding) => finding.severity === 'failure')
  const warnings = findings.filter((finding) => finding.severity === 'warning')
  const pass = (options.warnings === 'fail' ? findings : failures).length === 0
  if (pass && !state.isNot) {
    try {
      for (const warning of warnings) {
        test.info().annotations.push({ type: 'accessibility warning', description: line(warning).trim() })
      }
    } catch {}
  }
  const message = () => {
    const parts = state.isNot ? [`${name} was expected to find a problem and found none.`] : []
    if (failures.length) parts.push(`${counted(failures.length, 'failure')}:`, ...failures.map(line))
    if (warnings.length) parts.push(`${counted(warnings.length, 'warning')}:`, ...warnings.map(line))
    const context = findings[0]?.context
    if (context) parts.push(`Measured in ${context.engine} ${context.version} via Playwright.`)
    return parts.join('\n')
  }
  return { pass, message, name, actual: findings }
}

export const matchers = {
  async toHaveTruthfulExpandedState(this: ExpectMatcherState, received: Page | Locator, options: MatcherOptions = {}) {
    const { page, within } = scope(received)
    const findings = await findExpandedStateMismatches(page, { within })
    return result('toHaveTruthfulExpandedState', this, findings, options)
  },

  async toOpenADialogThatHoldsFocus(
    this: ExpectMatcherState,
    received: Locator,
    options: ModalWalkOptions & MatcherOptions = {},
  ) {
    const findings = await walkModal(received, options)
    return result('toOpenADialogThatHoldsFocus', this, findings, options)
  },

  async toHaveErrorsTiedToFields(
    this: ExpectMatcherState,
    received: Page | Locator,
    options: Omit<ErrorAssociationOptions, 'within'> & MatcherOptions = {},
  ) {
    const { page, within } = scope(received)
    const findings = await findUntiedErrors(page, { within, errors: options.errors })
    return result('toHaveErrorsTiedToFields', this, findings, options)
  },
}

export const expect = baseExpect.extend(matchers)
