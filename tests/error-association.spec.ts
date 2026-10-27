import { test, expect } from '@playwright/test'

import { findUntiedErrors, type Finding } from '../src/index.js'

const summary = (findings: Finding[]) =>
  findings.map((finding) => `${finding.severity} ${finding.criteria.join(' ')} ${finding.element.selector}`).sort()
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
    'failure 1.3.1 #plan > label:nth-of-type(1) > input',
    'failure 3.3.1 #plan > label:nth-of-type(2) > input',
  ])
})

test('page-level alerts, error-styled headings and fields, and errors inside labels are not flagged', async ({ page }) => {
  await page.goto('/errors/hazards.html')
  const findings = await findUntiedErrors(page)
  expect(findings, detail(findings)).toEqual([])
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
    'failure 1.3.1 #email',
    'failure 1.3.1 #name',
    'failure 1.3.1 #promo',
    'failure 1.3.1 #size > label:nth-of-type(1) > input',
    'failure 3.3.1 #phone',
    'failure 3.3.1 #postcode',
    'failure 3.3.1 #terms',
    'warning 3.3.1 #city',
  ])
})
