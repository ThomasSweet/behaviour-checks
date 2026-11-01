import { test, expect } from '@playwright/test'

import { findUntiedErrors, type Finding } from '../src/index.js'

const summary = (findings: Finding[]) =>
  findings.map((finding) => `${finding.code} ${finding.severity} ${finding.criteria.join(' ')} ${finding.element.selector}`).sort()
const detail = (findings: Finding[]) => JSON.stringify(findings, null, 2)

test('nothing is reported before anyone submits', async ({ page }) => {
  await page.goto('/errors/pass.html')
  const findings = await findUntiedErrors(page)
  expect(findings, detail(findings)).toEqual([])
})

test('a scripted form ties every error to its field, and a summary of links is not an error', async ({ page }) => {
  await page.goto('/errors/pass.html')
  await page.locator('#scripted-submit').click()
  await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true')
  const findings = await findUntiedErrors(page, { within: page.locator('#scripted') })
  expect(findings, detail(findings)).toEqual([])
})

test('a radio group whose error is tied to nothing is caught', async ({ page }) => {
  await page.goto('/errors/pass.html')
  await page.locator('#plan').evaluate((fieldset) => fieldset.removeAttribute('aria-describedby'))
  await page.locator('#scripted-submit').click()
  await expect(page.locator('#plan-error')).toBeVisible()
  const findings = await findUntiedErrors(page, { within: page.locator('#plan') })
  expect(summary(findings), detail(findings)).toEqual([
    'error-association/invalid-field-has-no-message failure 3.3.1 #plan > label:nth-of-type(2) > input',
    'error-association/visible-error-is-not-tied failure 1.3.1 #plan > label:nth-of-type(1) > input',
  ])
})

test('page-level alerts, error-styled headings and fields, and errors inside labels are not flagged', async ({ page }) => {
  await page.goto('/errors/hazards.html')
  const findings = await findUntiedErrors(page)
  expect(findings, detail(findings)).toEqual([])
})

test('an error among several fields is reported with no field named, and the field beside it is not accused', async ({ page }) => {
  await page.goto('/errors/flat.html')
  const findings = await findUntiedErrors(page, { within: page.locator('#flat') })
  expect(summary(findings), detail(findings)).toEqual([
    'error-association/error-among-several-fields warning  #flat > p.error',
    'error-association/invalid-field-has-no-message failure 3.3.1 #email',
  ])
  const warning = findings.find((finding) => finding.severity === 'warning')
  expect(warning?.element.label).toBe('Name is required.')
  expect(warning?.what).toContain('"Name is required."')
  expect(warning?.what).toContain('The check does not guess which one it belongs to')
})

test('fields inside their labels and two fields sharing a wrapper count as several fields too', async ({ page }) => {
  await page.goto('/errors/flat.html')
  for (const [form, message] of [
    ['#labels', '#labels > span.error'],
    ['#row', '#row > div.field:nth-of-type(1) > div.dates > p.error'],
  ]) {
    const findings = await findUntiedErrors(page, { within: page.locator(form) })
    expect(summary(findings), detail(findings)).toEqual([`error-association/error-among-several-fields warning  ${message}`])
  }
})

test('a tied error, a form-level message beside field wrappers and a radio group do not get the warning', async ({ page }) => {
  await page.goto('/errors/flat.html')
  for (const form of ['#tied', '#wrapped']) {
    const findings = await findUntiedErrors(page, { within: page.locator(form) })
    expect(findings, detail(findings)).toEqual([])
  }
  const radios = await findUntiedErrors(page, { within: page.locator('#radios') })
  expect(summary(radios), detail(radios)).toEqual([
    'error-association/visible-error-is-not-tied failure 1.3.1 #radios > label:nth-of-type(1) > input',
  ])
})

test('a button or link with error in its class is not an error message', async ({ page }) => {
  await page.goto('/errors/flat.html')
  for (const form of ['#controls', '#controls-flat']) {
    const findings = await findUntiedErrors(page, { within: page.locator(form) })
    expect(findings, detail(findings)).toEqual([])
  }
})

test('a scope that matches two forms checks both instead of failing strictly', async ({ page }) => {
  await page.goto('/errors/hazards.html')
  const findings = await findUntiedErrors(page, { within: page.locator('form') })
  expect(findings, detail(findings)).toEqual([])
})

test('a scope that never appears fails clearly instead of hanging', async ({ page }) => {
  await page.goto('/errors/hazards.html')
  await expect(findUntiedErrors(page, { within: page.locator('#nowhere') })).rejects.toThrow(/within matched no element/)
})

test('a form that leaves validation to the browser passes', async ({ page }) => {
  await page.goto('/errors/pass.html')
  await page.locator('#native-submit').click()
  await expect(page.locator('#native-name')).toBeFocused()
  const findings = await findUntiedErrors(page, { within: page.locator('#native') })
  expect(findings, detail(findings)).toEqual([])
})

test('the failing form reports exactly the planted faults', async ({ page }) => {
  await page.goto('/errors/fail.html')
  const findings = await findUntiedErrors(page)
  expect(summary(findings), detail(findings)).toEqual([
    'error-association/invalid-field-has-no-message failure 3.3.1 #phone',
    'error-association/invalid-field-has-no-message failure 3.3.1 #terms',
    'error-association/tied-message-is-empty failure 3.3.1 #postcode',
    'error-association/tied-message-is-hidden warning 3.3.1 #city',
    'error-association/visible-error-is-not-tied failure 1.3.1 #email',
    'error-association/visible-error-is-not-tied failure 1.3.1 #name',
    'error-association/visible-error-is-not-tied failure 1.3.1 #promo',
    'error-association/visible-error-is-not-tied failure 1.3.1 #size > label:nth-of-type(1) > input',
  ])
})
