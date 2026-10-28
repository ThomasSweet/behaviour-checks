import { test, expect } from '@playwright/test'

import { findExpandedStateMismatches, findUntiedErrors, walkModal, type Finding } from '../src/index.js'

const site = 'http://localhost:4173'

const clean = [
  '/',
  '/standard.html',
  '/craft.html',
  '/showcase.html',
  '/proof.html',
  '/glossary.html',
  '/agent-skill.html',
  '/screen-reader.html',
  '/devtools.html',
  '/impressum.html',
  '/privacy.html',
  '/404.html',
  '/audit-room.html',
  '/listening-room.html',
]

const rooms = ['/broken-page.html', '/broken-press-kit.html']

test.skip(!process.env.SITE_DIR, 'runs against a local a11y-foundation build: npm run test:site')
test.use({ contextOptions: { reducedMotion: 'reduce' } })
test.setTimeout(180_000)

function print(path: string, findings: Finding[]) {
  for (const finding of findings) {
    const { context, code, severity, criteria, element, what } = finding
    console.log(`FINDING ${context.engine} ${path} ${code} ${severity} ${criteria.join(' ')} ${element.selector} "${element.label}": ${what}`)
  }
}

const chromiumCarouselStop = 'modal-walk/blank-stop-behind-dialog'

const failures = (findings: Finding[]) =>
  findings.filter((finding) => finding.severity === 'failure').map((finding) => `${finding.element.selector}: ${finding.what}`)

for (const path of [...clean, ...rooms]) {
  test(`expanded state, and errors at rest, on ${path}`, async ({ page }) => {
    await page.goto(site + path, { waitUntil: 'networkidle' })
    const findings = [...(await findExpandedStateMismatches(page)), ...(await findUntiedErrors(page))]
    print(path, findings)
    expect(failures(findings)).toEqual([])
  })
}

for (const [path, name] of [
  ['/craft.html', 'Open dialog'],
  ['/showcase.html', 'Open the dialog'],
] as const) {
  test(`the "${name}" dialog on ${path} holds focus and gives it back`, async ({ page }) => {
    await page.goto(site + path, { waitUntil: 'networkidle' })
    const opener = page.getByRole('button', { name, exact: true })
    await opener.scrollIntoViewIfNeeded()
    const findings = await walkModal(opener)
    print(`${path} ${name}`, findings)
    expect(findings.map((finding) => finding.code).filter((code) => code !== chromiumCarouselStop)).toEqual([])
  })
}

test('the closedby="none" takeover dialog warns only that Escape does not close it, as designed', async ({ page }) => {
  await page.goto(`${site}/showcase.html`, { waitUntil: 'networkidle' })
  const opener = page.getByRole('button', { name: 'Open takeover dialog', exact: true })
  await opener.scrollIntoViewIfNeeded()
  const findings = await walkModal(opener, { close: page.getByRole('button', { name: 'Got it', exact: true }) })
  print('/showcase.html takeover', findings)
  expect(findings.map((finding) => finding.code).filter((code) => code !== chromiumCarouselStop)).toEqual([
    'modal-walk/escape-does-not-close',
  ])
})

test('the craft form ties its errors after an empty submit', async ({ page }) => {
  await page.goto(`${site}/craft.html`, { waitUntil: 'networkidle' })
  const form = page.locator('form.demo-stack')
  await form.getByRole('button', { name: 'Save' }).click()
  const findings = await findUntiedErrors(page, { within: form })
  print('/craft.html form', findings)
  expect(findings).toEqual([])
})
