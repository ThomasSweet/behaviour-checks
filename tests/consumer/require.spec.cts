import { test } from '@playwright/test'
import { expect, findExpandedStateMismatches, findUntiedErrors, walkModal } from '@accessible-by-default/checks'

test('require() loads the package, and a lying disclosure fails', async ({ page }) => {
  await page.setContent(`
    <button aria-expanded="false" aria-controls="panel">More</button>
    <div id="panel">Already showing</div>
  `)
  await expect(page).not.toHaveTruthfulExpandedState()
  const findings = await findExpandedStateMismatches(page)
  expect(findings.map(({ check, severity, criteria }) => ({ check, severity, criteria }))).toContainEqual({
    check: 'expanded-state',
    severity: 'failure',
    criteria: ['4.1.2'],
  })
  expect([typeof walkModal, typeof findUntiedErrors]).toEqual(['function', 'function'])
})
