import { test, expect } from '@playwright/test'

import { findExpandedStateMismatches, type Finding } from '../src/index.js'

const summary = (findings: Finding[]) =>
  findings.map((finding) => `${finding.severity} ${finding.criteria.join(' ')} ${finding.element.selector}`).sort()

test('the passing page has nothing to report, and the submit button is never pressed', async ({ page }) => {
  await page.goto('/expanded-state/pass.html')
  const findings = await findExpandedStateMismatches(page)
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([])
  await expect(page).toHaveURL(/pass\.html$/)
})

test('the failing page reports exactly the planted faults', async ({ page }) => {
  await page.goto('/expanded-state/fail.html')
  const findings = await findExpandedStateMismatches(page)
  expect(summary(findings), JSON.stringify(findings, null, 2)).toEqual([
    'failure 2.1.1 #no-tab-stop',
    'failure 2.1.1 #pointer-only',
    'failure 4.1.2 #stale',
    'failure 4.1.2 #stale-far',
    'failure 4.1.2 #wrong-at-rest',
    'warning 4.1.2 #dead',
    'warning 4.1.2 #hardcoded',
    'warning 4.1.2 #hardcoded-summary',
  ])
})

test('a stale attribute on a native invoker says what this engine could check', async ({ page, browserName }) => {
  await page.goto('/expanded-state/fail.html')
  const findings = await findExpandedStateMismatches(page)
  const stale = findings.filter((finding) => finding.element.selector.startsWith('#hardcoded'))
  expect(stale).toHaveLength(2)
  for (const finding of stale) {
    expect(finding.what).toContain('its aria-expanded attribute reports collapsed while its target')
    expect(finding.what).toContain(
      browserName === 'chromium'
        ? "Chromium's accessibility tree ignores the attribute"
        : "this engine's accessibility tree cannot be read here",
    )
  }
})

test('the check leaves every panel as it found it', async ({ page }) => {
  await page.goto('/expanded-state/fail.html')
  const panels = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[id$="-panel"], details')].map(
        (node) => `${node.id || node.localName} ${node.checkVisibility() && (!(node instanceof HTMLDetailsElement) || node.open)}`,
      ),
    )
  const before = await panels()
  await findExpandedStateMismatches(page)
  expect(await panels()).toEqual(before)
})

test('widgets that move focus, submit, reset or start open are handled without harm', async ({ page }) => {
  await page.goto('/expanded-state/hazards.html')
  const state = () =>
    page.evaluate(() => ({
      value: (document.getElementById('q') as HTMLInputElement).value,
      sectionA: document.getElementById('single-a')!.getAttribute('aria-expanded'),
      banner: document.getElementById('banner')!.matches(':popover-open'),
      menuOpen: (document.getElementById('menu-dialog') as HTMLDialogElement).open,
      focused: document.activeElement === document.body,
    }))
  const before = await state()
  const findings = await findExpandedStateMismatches(page)
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([])
  await expect(page).toHaveURL(/hazards\.html$/)
  expect(await state()).toEqual(before)
})

test('a lie inside an off-screen content-visibility section is still found', async ({ page }) => {
  await page.goto('/expanded-state/fail.html')
  const findings = await findExpandedStateMismatches(page, { within: page.locator('section') })
  expect(summary(findings)).toEqual(['failure 4.1.2 #stale-far'])
})

test('a page inside an iframe is checked in its own frame', async ({ page }) => {
  await page.goto('/frames/expanded.html')
  const findings = await findExpandedStateMismatches(page, {
    within: page.frameLocator('iframe').locator('main'),
  })
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([])
})

test('a scope that never appears fails clearly instead of passing or hanging', async ({ page }) => {
  await page.goto('/expanded-state/pass.html')
  await expect(findExpandedStateMismatches(page, { within: page.locator('#nowhere') })).rejects.toThrow(
    /within matched no element/,
  )
})

test('a scope that renders late is waited for', async ({ page }) => {
  await page.goto('/expanded-state/fail.html')
  await page.evaluate(() => {
    const main = document.querySelector('main')!
    main.remove()
    setTimeout(() => document.body.append(main), 300)
  })
  const findings = await findExpandedStateMismatches(page, { within: page.locator('main') })
  expect(summary(findings)).toContain('failure 4.1.2 #stale')
})

test('a check scoped to one element looks only inside it', async ({ page }) => {
  await page.goto('/expanded-state/fail.html')
  await page.evaluate(() => {
    const box = document.createElement('section')
    box.id = 'scope'
    box.append(document.getElementById('stale')!, document.getElementById('stale-panel')!)
    document.querySelector('main')!.append(box)
  })
  const findings = await findExpandedStateMismatches(page, { within: page.locator('#scope') })
  expect(summary(findings)).toEqual(['failure 4.1.2 #stale'])
})
