import { expect as base, test } from '@playwright/test'
import {
  expect,
  findExpandedStateMismatches,
  findUntiedErrors,
  matchers,
  type Finding,
  type FindingCode,
} from '@accessible-by-default/checks'

const extended = base.extend({ ...matchers })

test('import loads the package, and all three matchers pass a page that keeps its promises', async ({ page }) => {
  await page.setContent(`
    <button popovertarget="menu">Menu</button>
    <div popover id="menu">Items</div>
    <button id="open" onclick="document.querySelector('dialog').showModal()">Open</button>
    <dialog><button>Close</button></dialog>
    <form>
      <label for="email">Email</label>
      <input id="email" aria-invalid="true" aria-describedby="email-error">
      <p id="email-error">Enter an email address</p>
    </form>
  `)
  await expect(page).toHaveTruthfulExpandedState({ warnings: 'fail' })
  await expect(page.locator('#open')).toOpenADialogThatHoldsFocus({
    close: page.getByRole('button', { name: 'Close' }),
  })
  await extended(page.locator('form')).toHaveErrorsTiedToFields()
  const findings: Finding[] = await findUntiedErrors(page)
  const codes: FindingCode[] = findings.map((finding) => finding.code)
  expect(codes).toEqual([])
})

test('import gives each finding its code', async ({ page }) => {
  await page.setContent(`
    <button aria-expanded="false" aria-controls="panel">More</button>
    <div id="panel">Already showing</div>
  `)
  const codes: FindingCode[] = (await findExpandedStateMismatches(page)).map((finding) => finding.code)
  expect(codes).toContain('expanded-state/state-contradicts-target')
})
