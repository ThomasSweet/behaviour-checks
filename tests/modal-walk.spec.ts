import { test, expect } from '@playwright/test'

import { walkModal, type Finding } from '../src/index.js'

const summary = (findings: Finding[]) =>
  findings.map((finding) => `${finding.code} ${finding.severity} ${finding.criteria.join(' ')} ${finding.element.selector}`)
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
  expect(summary(findings), detail(findings)).toEqual([
    'modal-walk/focus-does-not-move-in failure  #fake',
    'modal-walk/tab-reaches-page-behind failure  #fake',
    'modal-walk/tab-reaches-page-behind failure  #fake',
  ])
  expect(findings[0].what).toContain('focus stayed outside the dialog when it opened')
  expect(findings[1].what).toMatch(/Tab moved focus out of the dialog to #after/)
  expect(findings[1].what).toContain('It is not modal')
})

test('an opener inside a shadow root is focused, followed and given focus back', async ({ page }) => {
  await page.goto('/modal/pass-shadow.html')
  const findings = await walkModal(page.locator('x-opener').getByRole('button'))
  expect(findings, detail(findings)).toEqual([])
})

test('content slotted into a dialog that lives in a shadow root counts as inside it', async ({ page }) => {
  await page.goto('/modal/pass-slotted.html')
  const findings = await walkModal(page.locator('x-sheet').getByRole('button', { name: 'Share this page' }))
  expect(findings, detail(findings)).toEqual([])
})

test('a leaky dialog whose buttons live in shadow roots is walked to its edge', async ({ page }) => {
  await page.goto('/modal/fail-shadow-leaky.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual([
    'modal-walk/tab-reaches-page-behind failure 2.4.3 #tools',
    'modal-walk/tab-reaches-page-behind failure 2.4.3 #tools',
  ])
  expect(findings[0].what).toMatch(/Tab moved focus out of the dialog to #after/)
})

test('a modal opened from inside another modal is the one walked', async ({ page, browserName }) => {
  await page.goto('/modal/pass-nested.html')
  await page.locator('#open').click()
  const findings = await walkModal(page.locator('#reset'))
  expect(summary(findings), detail(findings)).toEqual(
    browserName === 'webkit'
      ? ['modal-walk/blank-stop-behind-dialog warning  #confirm', 'modal-walk/focus-stays-off-page warning 2.4.3 #confirm']
      : [],
  )
  if (browserName === 'webkit') {
    expect(findings[0].what).toMatch(/^Alt\+Tab stopped once in the page behind the dialog with nothing focused: #settings/)
    expect(findings[1].what).toBe('Alt+Tab took focus off the page and 20 presses did not bring it back into the dialog')
  }
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
  expect(summary(findings), detail(findings)).toEqual([
    'modal-walk/tab-reaches-page-behind failure 2.4.3 #leaky',
    'modal-walk/tab-reaches-page-behind failure 2.4.3 #leaky',
  ])
  expect(findings[0].what).toMatch(/^(Alt\+)?Tab moved focus out of the dialog to #after/)
  expect(findings[1].what).toMatch(/^(Alt\+)?Shift\+Tab moved focus out of the dialog to #open/)
})

test('a dialog that drops focus on close is caught', async ({ page }) => {
  await page.goto('/modal/fail-no-return.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual(['modal-walk/focus-does-not-return failure 2.4.3 #open'])
  expect(findings[0].what).toContain('focus went to the page body when the dialog closed')
})

test('a dialog that ignores Escape warns, and the named close control finishes the walk', async ({ page }) => {
  await page.goto('/modal/fail-no-escape.html')
  const findings = await walkModal(page.locator('#open'), { close: page.locator('#stubborn-close') })
  expect(summary(findings), detail(findings)).toEqual(['modal-walk/escape-does-not-close warning 2.1.2 #stubborn'])
})

test('Chromium stops on an inert CSS carousel behind a modal: warned as a browser bug, not missed', async ({ page, browserName }) => {
  await page.goto('/modal/warn-carousel.html')
  const findings = await walkModal(page.locator('#open'))
  if (browserName !== 'chromium') {
    expect(findings, detail(findings)).toEqual([])
    return
  }
  expect(summary(findings), detail(findings)).toEqual(['modal-walk/blank-stop-behind-dialog warning  #dialog'])
  expect(findings[0].what).toMatch(/^Tab stopped (once|twice|\d+ times) in the page behind the dialog with nothing focused: .*li\.carousel-slide/)
})

test('a dialog whose script drops focus that reached the page behind is caught', async ({ page }) => {
  await page.goto('/modal/fail-blur-trap.html')
  const findings = await walkModal(page.locator('#open'))
  expect(findings.length, detail(findings)).toBeGreaterThan(0)
  for (const finding of findings) {
    expect(`${finding.code} ${finding.severity} ${finding.criteria.join(' ')}`).toBe('modal-walk/tab-reaches-page-behind failure 2.4.3')
    expect(finding.what).toMatch(/moved focus out of the dialog to #(before|after) .* on the page behind it, which then lost focus$/)
  }
})

test('an opener that opens nothing is reported', async ({ page }) => {
  await page.goto('/modal/fail-no-dialog.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual(['modal-walk/no-dialog-opens failure  #open'])
})

test('an opener that only a click opens fails 2.1.1', async ({ page }) => {
  await page.goto('/modal/fail-enter-ignored.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual(['modal-walk/enter-does-not-open failure 2.1.1 #open'])
})

test('an opener that cannot take focus fails 2.1.1, and focus has nowhere to return', async ({ page }) => {
  await page.goto('/modal/fail-opener-unfocusable.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual([
    'modal-walk/opener-cannot-take-focus failure 2.1.1 #open',
    'modal-walk/focus-does-not-return failure 2.4.3 #open',
  ])
})

test('a modal dialog that closes when Tab moves focus is reported', async ({ page }) => {
  await page.goto('/modal/fail-closes-on-tab.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual(['modal-walk/tab-closes-dialog failure 2.4.3 #fleeting'])
})

test('a modal dialog that neither Escape nor its close control closes is reported', async ({ page }) => {
  await page.goto('/modal/fail-unclosable.html')
  const findings = await walkModal(page.locator('#open'), { close: page.locator('#stuck-close') })
  expect(summary(findings), detail(findings)).toEqual([
    'modal-walk/escape-does-not-close warning 2.1.2 #stuck',
    'modal-walk/close-control-does-not-close failure 2.1.2 #stuck',
  ])
})

test('a modal dialog that leaves focus behind when it opens fails 2.4.3', async ({ page }) => {
  await page.goto('/modal/fail-no-focus-in.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual(['modal-walk/focus-does-not-move-in failure 2.4.3 #stay'])
})

const carouselBug = (findings: Finding[], browserName: string, dialog: string) => {
  if (browserName === 'chromium') {
    expect(summary(findings), detail(findings)).toEqual([`modal-walk/blank-stop-behind-dialog warning  ${dialog}`])
    expect(findings[0].what).toMatch(/took focus and lost it at once\. That element is inert, so this is a browser bug/)
  } else {
    expect(findings, detail(findings)).toEqual([])
  }
}

test('many carousel stops behind a modal give one browser-bug warning, not a focus-left-the-page warning', async ({ page, browserName }) => {
  await page.goto('/modal/warn-carousel-long.html')
  const findings = await walkModal(page.locator('#open'))
  carouselBug(findings, browserName, '#dialog')
  if (browserName === 'chromium') expect(findings[0].what).toMatch(/^Tab stopped 24 times/)
})

test('inertness through a shadow root counts: the carousel stop is a browser bug, not a leak', async ({ page, browserName }) => {
  await page.goto('/modal/warn-carousel-shadow.html')
  carouselBug(await walkModal(page.locator('#open')), browserName, '#shadowed')
})

test('a role=dialog inside a showModal() wrapper: the wrapper makes the page inert, and focus on it is not a leak', async ({ page, browserName }) => {
  await page.goto('/modal/warn-carousel-wrapped.html')
  carouselBug(await walkModal(page.locator('#open')), browserName, '#inner')
})

test('inertness from CSS interactivity counts where the engine supports it', async ({ page, browserName }) => {
  await page.goto('/modal/warn-carousel-interactivity.html')
  const findings = await walkModal(page.locator('#open'))
  if (browserName === 'chromium') {
    carouselBug(findings, browserName, '#locked')
    return
  }
  expect(findings.length, detail(findings)).toBeGreaterThan(0)
  for (const finding of findings) expect(finding.code).toBe('modal-walk/tab-reaches-page-behind')
})

test('a page that goes inert only after focus escaped fails, it is not a browser bug', async ({ page }) => {
  await page.goto('/modal/fail-late-inert.html')
  const findings = await walkModal(page.locator('#open'))
  expect(findings.length, detail(findings)).toBeGreaterThan(0)
  for (const finding of findings) {
    expect(`${finding.code} ${finding.severity} ${finding.criteria.join(' ')}`).toBe('modal-walk/tab-reaches-page-behind failure 2.4.3')
  }
})

test('a page that replaces the element focus reached is reported, without crashing on the removed element', async ({ page }) => {
  await page.goto('/modal/fail-swapped.html')
  const findings = await walkModal(page.locator('#open'))
  expect(findings.length, detail(findings)).toBeGreaterThan(0)
  for (const finding of findings) {
    expect(finding.code).toBe('modal-walk/tab-reaches-page-behind')
    expect(finding.what).toMatch(/to #(before|after) "Saved for later" on the page behind it, which then lost focus$/)
  }
})

const allLeaks = (findings: Finding[]) => {
  expect(findings.length, detail(findings)).toBeGreaterThan(0)
  for (const finding of findings) {
    expect(`${finding.code} ${finding.severity} ${finding.criteria.join(' ')}`).toBe('modal-walk/tab-reaches-page-behind failure 2.4.3')
  }
}

test('focus on a focusable wrapper around the page and the dialog is a leak, not inside the dialog', async ({ page }) => {
  await page.goto('/modal/fail-wrapper-leak.html')
  const findings = await walkModal(page.locator('#open'))
  allLeaks(findings)
  for (const finding of findings) expect(finding.what).toContain('#app')
})

test('a page that focuses a wrapper of the dialog instead of the dialog fails to move focus in', async ({ page }) => {
  await page.goto('/modal/fail-wrapper-focused.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual(['modal-walk/focus-does-not-move-in failure 2.4.3 #photo'])
  expect(findings[0].what).toContain('on #main')
})

test('a shadow page made inert only after focus escaped is a leak, not a browser bug', async ({ page }) => {
  await page.goto('/modal/fail-late-inert-shadow.html')
  allLeaks(await walkModal(page.locator('x-shell').locator('#open')))
})

test('a page locked with CSS only after focus escaped is a leak, not a browser bug', async ({ page }) => {
  await page.goto('/modal/fail-late-interactivity.html')
  allLeaks(await walkModal(page.locator('#open')))
})

test('a page that swallows focusin before the walk sees it still gets caught', async ({ page }) => {
  await page.goto('/modal/fail-blur-trap-stopped.html')
  allLeaks(await walkModal(page.locator('#open')))
})

test('a dialog whose buttons live in its own shadow root is walked, closed with Escape and checked for focus return', async ({ page }) => {
  await page.goto('/modal/fail-shadow-host.html')
  const findings = await walkModal(page.locator('#open'))
  expect(summary(findings), detail(findings)).toEqual([
    'modal-walk/tab-reaches-page-behind failure 2.4.3 #tools',
    'modal-walk/tab-reaches-page-behind failure 2.4.3 #tools',
  ])
})

test('behind a native modal, a carousel stop stays a browser bug even when the page adds inert during the press', async ({ page, browserName }) => {
  await page.goto('/modal/warn-carousel-guarded.html')
  carouselBug(await walkModal(page.locator('#open')), browserName, '#dialog')
})
