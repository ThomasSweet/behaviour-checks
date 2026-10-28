# Playwright issue: expanded state of popover invokers

Draft for Thomas to file at
https://github.com/microsoft/playwright/issues/new?template=bug.yml (the
Bug Report template). Not filed. Every fact below was checked on 27
October 2026, and the repro was run that day.

## Before you file

1. The bug template rejects reports without a repository link: "Bug
   reports without a minimal reproduction will be rejected." Create a
   public repository, for example `playwright-expanded-invokers`, with the
   four files under "Repro repository" below, and put its URL where the
   body says `<REPO URL>`. Add a `.gitignore` with `node_modules`,
   `test-results` and `playwright-report`.
2. In that repository, run `npx envinfo --preset playwright` and paste the
   output into the Environment field. The values there now are the ones I
   read by hand.
3. Search the issues again for `popovertarget`, `commandfor` and
   `popover expanded`.
4. If 1.65 has shipped by then, run the repro on it and update the
   Version field.

---

## Title

```
[Bug]: getByRole({ expanded }) and aria snapshots ignore the state of popover invokers (popovertarget, command)
```

## Body

The fields follow the template's order.

### Version

```
1.64.1
```

### Steps to reproduce

````markdown
1. Clone <REPO URL>
2. `npm install`
3. `npx playwright install chromium firefox webkit`
4. `npx playwright test`

The page has three buttons that open popovers without script:

```html
<button popovertarget="first">Popover target</button>
<div id="first" popover>Opened with popovertarget.</div>

<button commandfor="second" command="toggle-popover">Command toggle</button>
<div id="second" popover>Opened with command="toggle-popover".</div>

<button popovertarget="third" aria-expanded="false">Popover target with aria-expanded</button>
<div id="third" popover>Opened, but the attribute still says false.</div>
```

For each button, one test opens its popover, checks that it is open, then asks for the button by its expanded state:

```ts
await page.getByRole('button', { name, exact: true }).click()
await expect(page.locator(':popover-open')).toHaveCount(1)
await expect(page.getByRole('button', { name, exact: true, expanded: true })).toBeVisible({ timeout: 2000 })
```

A second test does the same with `toMatchAriaSnapshot('- button "<name>" [expanded]')`. A third, Chromium only, reads `expanded` from Chromium's own accessibility tree with `Accessibility.getFullAXTree` over CDP, before and after the click.
````

### Expected behavior

```markdown
Each button matches `expanded: false` while its popover is closed and `expanded: true` once it is open, and its aria snapshot shows `[expanded]` when open.

That is the mapping HTML-AAM gives these buttons, and it is what Chromium reports:

- HTML-AAM, [`popovertarget`](https://w3c.github.io/aria/html-aam/#att-popovertarget): "If the associated element is displayed as a popover: `aria-expanded=true`" and "If the associated element is hidden: `aria-expanded=false`".
- HTML-AAM, [`command` in the Toggle, Show, and Hide popover states](https://w3c.github.io/aria/html-aam/#att-command-popovers): the same two lines, word for word.
- Chromium 156's accessibility tree reports `expanded: false` for all three buttons before the click and `expanded: true` after it. That includes the third button: Chromium follows the popover and ignores the stale `aria-expanded="false"`.
```

### Actual behavior

````markdown
Every getByRole test and every aria snapshot test fails, in Chromium, Firefox and WebKit: 18 failures. The three Chromium accessibility tree tests pass.

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Command toggle', exact: true, expanded: true })
Expected: visible
Timeout: 2000ms
Error: element(s) not found
```

```
Error: expect(locator).toMatchAriaSnapshot(expected) failed

Locator:  getByRole('button', { name: 'Popover target', exact: true })
Expected: "- button \"Popover target\" [expanded]"
Received: "- button \"Popover target\""
Timeout:  2000ms
```

- The two buttons without the attribute have no expanded state in Playwright at all. While their popovers are closed, they do not match `expanded: false` either.
- The third button is reported collapsed while its popover is open, because Playwright reads the attribute. Chromium reports it expanded, so Playwright and the browser it drives disagree about the same element.

The cause looks like `getAriaExpanded` in [`packages/injected/src/roleUtils.ts`](https://github.com/microsoft/playwright/blob/81a95bede21fcf716e60cf3205e73600dc71b32c/packages/injected/src/roleUtils.ts#L1228-L1242). It returns `open` for `<details>` and otherwise reads only the `aria-expanded` attribute. The 1.64.1 bundle has the same function.
````

### Additional context

````markdown
- [`getChecked`](https://github.com/microsoft/playwright/blob/81a95bede21fcf716e60cf3205e73600dc71b32c/packages/injected/src/roleUtils.ts#L1180-L1197), in the same file, already lets native state win: a checkbox `<input>` reports `.checked` before `aria-checked` is read. The docs say `checked` is "usually set by `aria-checked` or native `<input type=checkbox>` controls", while `expanded` mentions only `aria-expanded`. Popover invokers are the native case for `expanded`.
- A possible fix. I ran this logic in the page, as plain JavaScript, in Chromium 156, Firefox 157 and WebKit 27.2, against the three repro buttons plus a `command="show-popover"` button, a `popovertarget` pointing at an element without `popover`, and a button inside its own popover. It returned `false` then `true` for the four invokers, `null` for the non-popover target, and `undefined` for the button inside its own popover:

  ```ts
  const kPopoverCommands = ['toggle-popover', 'show-popover', 'hide-popover'];

  function getPopoverInvokerExpanded(element: Element): boolean | undefined | null {
    const invoker = element as HTMLButtonElement;
    const target = invoker.popoverTargetElement ?? (kPopoverCommands.includes(invoker.command) ? invoker.commandForElement : null);
    if (!target || !target.hasAttribute('popover'))
      return null;
    if (target.contains(invoker))
      return undefined;
    return target.matches(':popover-open');
  }
  ```

  `getAriaExpanded` would call it for roles in `kAriaExpandedRoles` before it reads the attribute, and use the result unless it is `null`. `popoverTargetElement`, `commandForElement` and `command` exist on `HTMLButtonElement` in all three Playwright browsers. `contains` stands in for HTML-AAM's "accessibility ancestor".
- Why it matters: `popovertarget` and `command` let a page open menus and disclosures without script, and the browser keeps their state. To select these buttons by state in Playwright today, an author has to add `aria-expanded` by hand and keep it in sync with script, which is the stale state the third button shows.
- I searched issues and pull requests for `popovertarget`, `commandfor`, `popover expanded`, `aria-expanded popover` and `getAriaExpanded`, and found nothing on this.
- 1.65 is not out yet. `getAriaExpanded` is unchanged on main as of 81a95be (26 October 2026).
````

### Environment

Replace with the output of `npx envinfo --preset playwright` from the
repro repository.

```
System:
  OS: macOS 27.0.1
  CPU: arm64
Binaries:
  Node: 26.12.0
  npm: 11.20.0
npmPackages:
  @playwright/test: 1.64.1 => 1.64.1
Browsers (Playwright builds):
  Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2
```

---

## Repro repository

These are the files that ran on 27 October 2026, with the result above:
18 failed, 3 passed, 6 skipped (the Chromium tree test in Firefox and
WebKit).

`package.json`

```json
{
  "name": "playwright-expanded-invokers",
  "private": true,
  "scripts": {
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "1.64.1"
  }
}
```

`playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  reporter: 'list',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
```

`index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Expanded state of popover invokers</title>
  </head>
  <body>
    <button popovertarget="first">Popover target</button>
    <div id="first" popover>Opened with popovertarget.</div>

    <button commandfor="second" command="toggle-popover">Command toggle</button>
    <div id="second" popover>Opened with command="toggle-popover".</div>

    <button popovertarget="third" aria-expanded="false">Popover target with aria-expanded</button>
    <div id="third" popover>Opened, but the attribute still says false.</div>
  </body>
</html>
```

`tests/expanded.spec.ts`

```ts
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'

const names = ['Popover target', 'Command toggle', 'Popover target with aria-expanded']

async function chromiumExpanded(page: Page, name: string) {
  const client = await page.context().newCDPSession(page)
  const { nodes } = await client.send('Accessibility.getFullAXTree')
  const node = nodes.find((node) => node.role?.value === 'button' && node.name?.value === name)
  return node?.properties?.find((property) => property.name === 'expanded')?.value.value
}

test.beforeEach(async ({ page }) => {
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'))
})

for (const name of names) {
  test(`getByRole sees "${name}" as expanded once its popover is open`, async ({ page }) => {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.locator(':popover-open')).toHaveCount(1)
    await expect(page.getByRole('button', { name, exact: true, expanded: true })).toBeVisible({ timeout: 2000 })
  })

  test(`the aria snapshot of "${name}" says expanded once its popover is open`, async ({ page }) => {
    const button = page.getByRole('button', { name, exact: true })
    await button.click()
    await expect(page.locator(':popover-open')).toHaveCount(1)
    await expect(button).toMatchAriaSnapshot(`- button "${name}" [expanded]`, { timeout: 2000 })
  })

  test(`Chromium's accessibility tree reports "${name}" collapsed, then expanded`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'reads the accessibility tree over CDP')
    expect(await chromiumExpanded(page, name)).toBe(false)
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.locator(':popover-open')).toHaveCount(1)
    expect(await chromiumExpanded(page, name)).toBe(true)
  })
}
```

---

## Sources

All read or run on 27 October 2026.

1. Playwright main at commit
   [81a95be](https://github.com/microsoft/playwright/commit/81a95bede21fcf716e60cf3205e73600dc71b32c)
   (committed 26 October 2026, 22:08 UTC),
   `packages/injected/src/roleUtils.ts`: `getAriaExpanded` at lines 1228
   to 1242, `getChecked` at lines 1180 to 1197. The last commit to touch
   the file is 7199ba4 (25 October 2026), which changed label references,
   not `getAriaExpanded`.
2. Same commit, `roleSelectorEngine.ts` line 154 (the `expanded` filter
   calls `getAriaExpanded`) and `ariaSnapshot.ts` lines 288 and 289 (the
   snapshot sets `expanded` from it for roles in `kAriaExpandedRoles`).
3. The installed `@playwright/test` 1.64.1 in `~/Sites/behaviour-checks`,
   `node_modules/playwright-core/lib/coreBundle.js`: the same
   `getAriaExpanded`.
4. [Playwright releases](https://github.com/microsoft/playwright/releases):
   v1.64.1 is the latest, published 14 October 2026. npm dist-tags:
   `latest` 1.64.1, `next` 1.65.0-alpha-2026-10-26.
5. Playwright docs for the `getByRole` options, on
   [playwright.dev](https://playwright.dev/docs/api/class-page#page-get-by-role-option-expanded)
   and in `docs/src/api/params.md` at 81a95be: `expanded` is "usually set
   by `aria-expanded`"; `checked` is "usually set by `aria-checked` or
   native `<input type=checkbox>` controls".
6. [HTML-AAM Editor's Draft, 26 October 2026](https://w3c.github.io/aria/html-aam/)
   (served with Last-Modified 26 October 2026, 14:51 GMT): the
   [`popovertarget`](https://w3c.github.io/aria/html-aam/#att-popovertarget)
   entry and the
   [`command` in the Toggle, Show, and Hide popover states](https://w3c.github.io/aria/html-aam/#att-command-popovers)
   entry. Section numbers move between drafts, so these link the entries.
7. The repro above, run with Playwright 1.64.1, Chromium 156.0.8078.4,
   Firefox 157.0 and WebKit 27.2 on macOS 27.0.1 (arm64), Node 26.12.0:
   18 failed, 3 passed, 6 skipped. A separate run with the same page
   showed that `expanded: false` matches neither attribute-less button
   while closed.
8. The fix sketch, run in page context in the same three browsers, with
   one popover open at a time.
9. GitHub search of microsoft/playwright issues and pull requests for
   `popovertarget`, `commandfor`, `popover expanded`,
   `aria-expanded popover`, `getAriaExpanded` and
   `command toggle-popover`: no match on this topic.
10. Playwright's bug template, `.github/ISSUE_TEMPLATE/bug.yml` on main.

## What I could not confirm

- Firefox's and WebKit's own accessibility trees. Playwright has no API
  for them, so the browser-side evidence is Chromium only. HTML-AAM is
  the cross-engine argument.
- The repro was not run on a 1.65 alpha. I read main's source instead.
- The fix sketch has not been compiled inside Playwright or run against
  its test suite. It may need casts for the DOM typings Playwright builds
  against.

## Left out on purpose

- `<summary>`. Chromium's tree exposes it as a disclosure triangle with
  `expanded` false, then true. Playwright gives `<summary>` no role and
  snapshots the `<details>` as a group with no state. HTML-AAM's
  [`summary`](https://w3c.github.io/aria/html-aam/#el-summary) entry says
  "No corresponding role" in WAI-ARIA, and the
  [`open` attribute on `details`](https://w3c.github.io/aria/html-aam/#att-open-details)
  maps `aria-expanded` with "Set properties on the summary element." (same
  draft, read 27 October 2026), so it is a separate question and would blur
  this one. It could be a follow-up issue.
