import { test, expect } from '@playwright/test'

import { findExpandedStateMismatches, type Finding } from '../src/index.js'

const summary = (findings: Finding[]) =>
  findings.map((finding) => `${finding.code} ${finding.severity} ${finding.criteria.join(' ')} ${finding.element.selector}`).sort()

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
    'expanded-state/aria-expanded-contradicts-native-state warning 4.1.2 #hardcoded',
    'expanded-state/aria-expanded-contradicts-native-state warning 4.1.2 #hardcoded-summary',
    'expanded-state/cannot-take-focus failure 2.1.1 #no-tab-stop',
    'expanded-state/pointer-only failure 2.1.1 #pointer-only',
    'expanded-state/press-changes-nothing warning 4.1.2 #dead',
    'expanded-state/state-contradicts-target failure 4.1.2 #stale',
    'expanded-state/state-contradicts-target failure 4.1.2 #stale-far',
    'expanded-state/state-contradicts-target failure 4.1.2 #wrong-at-rest',
  ])
})

test('a stale attribute on a native invoker says what this engine could check', async ({ page, browserName }) => {
  await page.goto('/expanded-state/fail.html')
  const findings = await findExpandedStateMismatches(page)
  const stale = findings.filter((finding) => finding.element.selector.startsWith('#hardcoded'))
  expect(stale).toHaveLength(2)
  for (const finding of stale) {
    expect(finding.code).toBe('expanded-state/aria-expanded-contradicts-native-state')
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
      farOpen: document.getElementById('far-open')!.getAttribute('aria-expanded'),
      farPanel: document.getElementById('far-panel')!.hidden,
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
  expect(summary(findings)).toEqual(['expanded-state/state-contradicts-target failure 4.1.2 #stale-far'])
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
  expect(summary(findings)).toContain('expanded-state/state-contradicts-target failure 4.1.2 #stale')
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
  expect(summary(findings)).toEqual(['expanded-state/state-contradicts-target failure 4.1.2 #stale'])
})

test('invokers the check once misread: keyword case, commandfor over popovertarget, one-way buttons, shadow trees', async ({
  page,
  browserName,
}) => {
  await page.goto('/expanded-state/invokers.html')
  const supported = await page.evaluate(() => 'commandForElement' in HTMLButtonElement.prototype)
  test.skip(!supported, 'invoker commands are not in this engine')
  const findings = await findExpandedStateMismatches(page)
  expect(summary(findings), JSON.stringify(findings, null, 2)).toEqual([
    'expanded-state/aria-expanded-contradicts-native-state warning 4.1.2 #mixed-case',
    ...(browserName === 'chromium' ? ['expanded-state/aria-expanded-contradicts-native-state warning 4.1.2 #no-command'] : []),
    'expanded-state/not-a-tab-stop failure 2.1.1 #minus-one',
    ...(browserName === 'chromium' ? [] : ['expanded-state/press-changes-nothing warning 4.1.2 #no-command']),
    'expanded-state/press-changes-nothing warning 4.1.2 #unfocusable-dead',
    'expanded-state/state-contradicts-target failure 4.1.2 #inner-close',
  ])
  const open = await page.evaluate(() =>
    [...document.querySelectorAll('[popover]')].filter((node) => node.matches(':popover-open')).map((node) => node.id),
  )
  expect(open.toSorted()).toEqual(['command-show-only-popover', 'shadow-popover', 'show-only-popover'])
  const dead = findings.find((finding) => finding.element.selector === '#unfocusable-dead')
  expect(dead?.what).toBe('it cannot take focus, and clicking changed neither its state nor its target #unfocusable-dead-panel')
})

test('focus is given back to the page when the last invoker pressed sits in a shadow root', async ({ page }) => {
  await page.goto('/expanded-state/shadow-last.html')
  const findings = await findExpandedStateMismatches(page)
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([])
  const focused = await page.evaluate(() => {
    let node = document.activeElement
    while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement
    return node === document.body ? 'body' : (node?.id ?? node?.localName ?? 'nothing')
  })
  expect(focused).toBe('body')
})

test('popovertarget and commandfor on elements that invoke nothing are compared by their claim, not as native invokers', async ({ page }) => {
  await page.goto('/expanded-state/non-invokers.html')
  const findings = await findExpandedStateMismatches(page)
  expect(summary(findings), JSON.stringify(findings, null, 2)).toEqual([
    'expanded-state/state-contradicts-target failure 4.1.2 #disabled-command',
    'expanded-state/state-contradicts-target failure 4.1.2 #disabled-popover',
    'expanded-state/state-contradicts-target failure 4.1.2 #submit-popover',
  ])
})

test('a dialog command aimed at a non-dialog: Chromium runs popovertarget, HTML runs nothing, and the popover is put back', async ({
  page,
  browserName,
}) => {
  await page.goto('/expanded-state/dialog-command.html')
  const supported = await page.evaluate(() => 'commandForElement' in HTMLButtonElement.prototype)
  test.skip(!supported, 'invoker commands are not in this engine')
  const findings = await findExpandedStateMismatches(page)
  expect(summary(findings), JSON.stringify(findings, null, 2)).toEqual(
    browserName === 'chromium'
      ? ['expanded-state/aria-expanded-contradicts-native-state warning 4.1.2 #misaimed']
      : ['expanded-state/state-contradicts-target failure 4.1.2 #misaimed'],
  )
  expect(await page.locator('#misaimed-popover').evaluate((node) => node.matches(':popover-open'))).toBe(false)
})

test('putting widgets back never presses a control the check did not assess', async ({ page }) => {
  await page.goto('/expanded-state/restore-safety.html')
  const findings = await findExpandedStateMismatches(page)
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([])
  await expect(page.locator('#items li')).toHaveCount(2)
})

test('focus that starts on an SVG link is given back to it', async ({ page }) => {
  await page.goto('/expanded-state/focus-start.html')
  await page.locator('#svg-link').focus()
  await findExpandedStateMismatches(page)
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('svg-link')
})

test('focus that starts in a closed shadow root is not left on a widget the check pressed', async ({ page }) => {
  await page.goto('/expanded-state/focus-start.html')
  await page.locator('x-field').click()
  await findExpandedStateMismatches(page)
  expect(await page.evaluate(() => document.activeElement?.id ?? '')).not.toBe('disclosure')
})

test('a plain element that reports a state is reported, and never pressed', async ({ page }) => {
  await page.goto('/expanded-state/no-role.html')
  const findings = await findExpandedStateMismatches(page)
  expect(summary(findings), JSON.stringify(findings, null, 2)).toEqual([
    'expanded-state/state-contradicts-target failure 4.1.2 #wrong-at-rest',
    'expanded-state/state-has-no-role warning 4.1.2 #missing-target',
    'expanded-state/state-has-no-role warning 4.1.2 #no-target',
    'expanded-state/state-has-no-role warning 4.1.2 #wrapper',
    'expanded-state/toggle-has-no-role failure 4.1.2 #click-only',
    'expanded-state/toggle-has-no-role failure 4.1.2 #heading',
    'expanded-state/toggle-has-no-role failure 4.1.2 #keyboard',
    'expanded-state/toggle-has-no-role failure 4.1.2 #no-href',
  ])
  const what = (selector: string) => findings.find((finding) => finding.element.selector === selector)?.what
  expect(what('#click-only')).toBe(
    'it reports a state and names its target #click-only-panel, but it has no role attribute and is not a native control, so assistive technology is not told it can be operated. The check does not press it',
  )
  expect(what('#no-target')).toBe(
    'it reports a state and names no target on the page, but it has no role attribute and is not a native control. The check does not press it',
  )
  expect(await page.evaluate(() => (window as unknown as { pressed: string[] }).pressed)).toEqual([])
  await expect(page).toHaveURL(/no-role\.html$/)
})

test('a native control, a table part, an element with a role or a custom element is not reported', async ({ page }) => {
  await page.goto('/expanded-state/no-role.html')
  const findings = await findExpandedStateMismatches(page, { within: page.locator('#has-a-role') })
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([])
  expect(await page.evaluate(() => (window as unknown as { pressed: string[] }).pressed)).toEqual([])
})

test('a control Playwright cannot click is reported as that, not as a click that changed nothing', async ({ page }) => {
  await page.goto('/expanded-state/covered.html')
  const findings = await findExpandedStateMismatches(page)
  expect(summary(findings), JSON.stringify(findings, null, 2)).toEqual([
    'expanded-state/could-not-click warning  #dead',
    'expanded-state/could-not-click warning  #focusable',
    'expanded-state/could-not-click warning  #unfocusable',
  ])
  const what = (selector: string) => findings.find((finding) => finding.element.selector === selector)?.what
  expect(what('#focusable')).toBe('Enter and Space changed nothing and Playwright could not click it, so the check cannot tell whether a click operates it')
  expect(what('#unfocusable')).toBe('it cannot take focus and Playwright could not click it, so the check could not operate it')
  expect(await page.evaluate(() => (window as unknown as { coverClicks: number }).coverClicks)).toBe(0)
  await expect(page.locator('#keyboard-panel')).toBeHidden()
})

test('a control that Enter puts out of reach is not said to have had Space or a click', async ({ page }) => {
  await page.goto('/expanded-state/out-of-reach.html')
  const findings = await findExpandedStateMismatches(page)
  expect(summary(findings), JSON.stringify(findings, null, 2)).toEqual([
    'expanded-state/press-changes-nothing warning 4.1.2 #disables',
    'expanded-state/press-changes-nothing warning 4.1.2 #hides',
  ])
  const what = (selector: string) => findings.find((finding) => finding.element.selector === selector)?.what
  expect(what('#hides')).toBe('Enter changed neither its state nor its target #hides-panel, and left it out of reach')
  expect(what('#disables')).toBe('Enter did not change its state and left it out of reach, and it names no target to compare with')
})

test('a toggle behind an open modal dialog is not called dead, and one inside it is still checked', async ({ page }) => {
  await page.goto('/expanded-state/behind-modal.html')
  const findings = await findExpandedStateMismatches(page)
  expect(summary(findings), JSON.stringify(findings, null, 2)).toEqual([
    'expanded-state/could-not-click warning  #behind',
    'expanded-state/state-contradicts-target failure 4.1.2 #inside',
  ])
})

test('a toggle that is not rendered is not compared with its target, and not pressed', async ({ page }) => {
  await page.goto('/expanded-state/hidden-toggle.html')
  const findings = await findExpandedStateMismatches(page, { within: page.locator('#not-rendered') })
  expect(findings, JSON.stringify(findings, null, 2)).toEqual([])
  expect(await page.evaluate(() => (window as unknown as { pressed: string[] }).pressed)).toEqual([])
})

test('a toggle hidden at one width is skipped there and checked at a width that renders it', async ({ page }) => {
  await page.goto('/expanded-state/hidden-toggle.html')
  const wide = await findExpandedStateMismatches(page, { within: page.locator('#responsive') })
  expect(wide, JSON.stringify(wide, null, 2)).toEqual([])
  await page.setViewportSize({ width: 400, height: 800 })
  const narrow = await findExpandedStateMismatches(page, { within: page.locator('#responsive') })
  expect(summary(narrow), JSON.stringify(narrow, null, 2)).toEqual(['expanded-state/state-contradicts-target failure 4.1.2 #hamburger'])
})

test('a toggle that is only transparent or clipped is still compared, because a screen reader still gets it', async ({ page }) => {
  await page.goto('/expanded-state/hidden-toggle.html')
  const findings = await findExpandedStateMismatches(page, { within: page.locator('#only-invisible') })
  expect(summary(findings), JSON.stringify(findings, null, 2)).toEqual([
    'expanded-state/state-contradicts-target failure 4.1.2 #clipped',
    'expanded-state/state-contradicts-target failure 4.1.2 #transparent',
  ])
})
