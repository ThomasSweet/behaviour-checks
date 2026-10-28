import { test } from '@playwright/test'

import { expect } from '../src/index.js'

test('toHaveTruthfulExpandedState passes a truthful page and lists what a lying one got wrong', async ({ page }) => {
  await page.goto('/expanded-state/pass.html')
  await expect(page).toHaveTruthfulExpandedState()

  await page.goto('/expanded-state/fail.html')
  await expect(page.locator('main')).not.toHaveTruthfulExpandedState()
  const error = await expect(page).toHaveTruthfulExpandedState().catch((thrown: Error) => thrown)
  expect(String(error)).toContain(
    '#stale "Stale state": reports collapsed while its target #stale-panel is visible, after Enter (4.1.2) [expanded-state/state-contradicts-target]',
  )
  expect(String(error)).toMatch(/Measured in (chromium|firefox|webkit) [\d.]+ via Playwright\./)
})

test('warnings pass by default and fail when asked to', async ({ page }) => {
  await page.goto('/expanded-state/fail.html')
  await page.evaluate(() => {
    const box = document.createElement('section')
    box.id = 'only-warnings'
    box.append(document.getElementById('dead')!, document.getElementById('dead-panel')!)
    document.querySelector('main')!.append(box)
  })
  const scope = page.locator('#only-warnings')
  await expect(scope).toHaveTruthfulExpandedState()
  expect(test.info().annotations).toContainEqual({
    type: 'accessibility warning',
    description:
      '- #dead "Does nothing": pressing Enter or Space and clicking changed neither its state nor its target #dead-panel (4.1.2) [expanded-state/press-changes-nothing]',
  })
  await expect(scope).not.toHaveTruthfulExpandedState({ warnings: 'fail' })
})

test('the matcher form of the README example handles a page with two forms', async ({ page }) => {
  await page.goto('/errors/hazards.html')
  await expect(page.locator('form')).toHaveErrorsTiedToFields()
})

test('toOpenADialogThatHoldsFocus passes a native dialog and fails a leaky one', async ({ page }) => {
  await page.goto('/modal/pass-native.html')
  await expect(page.locator('#open-script')).toOpenADialogThatHoldsFocus()
  await page.goto('/modal/fail-leaky.html')
  await expect(page.locator('#open')).not.toOpenADialogThatHoldsFocus()
})

test('toHaveErrorsTiedToFields passes before a submit and fails the planted form', async ({ page }) => {
  await page.goto('/errors/pass.html')
  await expect(page).toHaveErrorsTiedToFields()
  await page.goto('/errors/fail.html')
  await expect(page.locator('form')).not.toHaveErrorsTiedToFields()
})
