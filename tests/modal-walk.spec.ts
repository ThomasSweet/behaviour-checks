import { test, expect } from '@playwright/test'

import { walkModal, type Finding } from '../src/index.js'

const summary = (findings: Finding[]) =>
  findings.map((finding) => `${finding.severity} ${finding.criteria.join(' ')} ${finding.element.selector}`)
const detail = (findings: Finding[]) => JSON.stringify(findings, null, 2)

test('a native dialog opened by script holds focus and gives it back', async ({ page }) => {
  await page.goto('/modal/pass-native.html')
  const findings = await walkModal(page.locator('#open-script'))
  expect(findings, detail(findings)).toEqual([])
})

test('a native dialog opened by an invoker command holds focus and gives it back', async ({ page }) => {
  await page.goto('/modal/pass-native.html')
  const supported = await page.evaluate(() => 'commandForElement' in HTMLButtonElement.prototype)
  test.skip(!supported, 'invoker commands are not in this engine')
  const findings = await walkModal(page.locator('#open-command'))
  expect(findings, detail(findings)).toEqual([])
})

test('an aria-modal dialog with the page behind it inert holds focus and gives it back', async ({ page }) => {
  await page.goto('/modal/pass-aria.html')
  const findings = await walkModal(page.locator('#open'))
  expect(findings, detail(findings)).toEqual([])
})

test('a popover dressed as a modal takes no focus and lets Tab walk the page behind', async ({ page }) => {
  await page.goto('/modal/fail-popover.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual(['failure  #fake', 'failure  #fake', 'failure  #fake'])
  expect(findings[0].what).toContain('focus stayed outside the dialog when it opened')
  expect(findings[1].what).toMatch(/Tab moved focus out of the dialog to #after/)
  expect(findings[1].what).toContain('It is not modal')
})

test('an opener inside a shadow root is focused, followed and given focus back', async ({ page }) => {
  await page.goto('/modal/pass-shadow.html')
  const findings = await walkModal(page.locator('x-opener').getByRole('button'))
  expect(findings, detail(findings)).toEqual([])
})

test('a leaky dialog whose buttons live in shadow roots is walked to its edge', async ({ page }) => {
  await page.goto('/modal/fail-shadow-leaky.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual(['failure 2.4.3 #tools', 'failure 2.4.3 #tools'])
  expect(findings[0].what).toMatch(/Tab moved focus out of the dialog to #after/)
})

test('a modal opened from inside another modal is the one walked', async ({ page, browserName }) => {
  await page.goto('/modal/pass-nested.html')
  await page.locator('#open').click()
  const findings = await walkModal(page.locator('#reset'))
  expect(summary(findings), detail(findings)).toEqual(browserName === 'webkit' ? ['warning 2.4.3 #confirm'] : [])
  if (browserName === 'webkit') expect(findings[0].what).toBe('Alt+Tab took focus off the page and 20 presses did not bring it back into the dialog')
})

test('a dialog that fades out counts as closed', async ({ page }) => {
  await page.goto('/modal/pass-fade.html')
  const findings = await walkModal(page.locator('#open'))
  expect(findings, detail(findings)).toEqual([])
})

test('a dialog inside an iframe is walked in its own frame', async ({ page }) => {
  await page.goto('/frames/modal.html')
  const findings = await walkModal(page.frameLocator('iframe').locator('#open-script'))
  expect(findings, detail(findings)).toEqual([])
})

test('an aria-modal dialog without a trap lets focus out both ways', async ({ page }) => {
  await page.goto('/modal/fail-leaky.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual(['failure 2.4.3 #leaky', 'failure 2.4.3 #leaky'])
  expect(findings[0].what).toMatch(/^(Alt\+)?Tab moved focus out of the dialog to #after/)
  expect(findings[1].what).toMatch(/^(Alt\+)?Shift\+Tab moved focus out of the dialog to #open/)
})

test('a dialog that drops focus on close is caught', async ({ page }) => {
  await page.goto('/modal/fail-no-return.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual(['failure 2.4.3 #open'])
  expect(findings[0].what).toContain('focus went to the page body when the dialog closed')
})

test('a dialog that ignores Escape warns, and the named close control finishes the walk', async ({ page }) => {
  await page.goto('/modal/fail-no-escape.html')
  const findings = await walkModal(page.locator('#open'), { close: page.locator('#stubborn-close') })
  expect(summary(findings), detail(findings)).toEqual(['warning 2.1.2 #stubborn'])
})
