# @accessible-by-default/checks

Playwright matchers that operate a page's widgets by keyboard, in Chromium,
Firefox and WebKit, and check that they behave as they claim:

- **Expanded state tells the truth.** A disclosure that says it is collapsed
  hides its panel.
- **A dialog holds focus and gives it back.** Tab and Shift+Tab never reach
  the page behind a modal, and focus returns to the opener.
- **Errors are tied to their fields.** Every invalid field has a message a
  screen reader can find from the field.

In WebAIM's screen reader survey #10 (December 2023 to January 2024),
respondents ranked interactive elements like menus, tabs and dialogs that do
not behave as expected second among problems, after CAPTCHA. The 2026 survey
did not ask that question. Two of these checks cover part of that item:
disclosures and dialogs. axe reads markup, so it cannot press a button and
look at what happened. These checks do, and nothing else. Run them next to
axe, not instead of it. Passing them is not conformance.

## Install

```bash
npm install --save-dev @accessible-by-default/checks
```

It is tested with `@playwright/test` 1.64.1 and supports 1.64 or later. It
needs Node 20.19 or later, the first Node 20 release that can `require` an ES
module; Node 20 itself is past its end of life.

## Use

```ts
import { test } from '@playwright/test'
import { expect } from '@accessible-by-default/checks'

test('disclosures and popovers report their state truthfully', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.locator('main')).toHaveTruthfulExpandedState()
})

test('the cart dialog holds focus and gives it back', async ({ page }) => {
  await page.goto('/shop')
  await expect(page.getByRole('button', { name: 'Cart' })).toOpenADialogThatHoldsFocus()
})

test('every error is tied to its field', async ({ page }) => {
  await page.goto('/booking')
  await page.getByRole('button', { name: 'Book' }).click()
  await expect(page.locator('form')).toHaveErrorsTiedToFields()
})
```

To add the matchers to an `expect` you already extend, spread `matchers`:

```ts
import { expect as base } from '@playwright/test'
import { matchers } from '@accessible-by-default/checks'

export const expect = base.extend({ ...matchers })
```

A matcher on a page checks the whole document. On a locator it checks inside
every element the locator matches, waiting up to five seconds for the first
one, and fails with a clear error if none appears. For a page inside an
iframe, use a locator from `page.frameLocator()`.

A failing matcher lists every finding and names the engine it measured in.
Warnings do not fail a test. On a passing test they are added to the
report as annotations of type `accessibility warning`; on a failing one they
are listed with the failures. To fail on warnings too, pass
`{ warnings: 'fail' }`.

### Findings as data

Each check is also a function that returns its findings, for anything that is
not a test:

```ts
import { findExpandedStateMismatches, findUntiedErrors, walkModal } from '@accessible-by-default/checks'

const disclosures = await findExpandedStateMismatches(page, { within: page.locator('header') })
const dialog = await walkModal(page.getByRole('button', { name: 'Cart' }))
const errors = await findUntiedErrors(page, { within: page.locator('form') })
```

```json
{
  "check": "expanded-state",
  "severity": "failure",
  "criteria": ["4.1.2"],
  "element": { "selector": "#menu-toggle", "label": "Menu" },
  "what": "reports collapsed while its target #site-menu is visible, after Enter",
  "context": { "engine": "firefox", "version": "157.0", "viewport": [1280, 720] }
}
```

`criteria` is empty when a finding is not a WCAG claim. `label` is a short
text to recognise the element by: its `aria-label`, its `aria-labelledby`
text, its `<label>`, its text, its `title` or its `placeholder`, in that
order. It is not the computed accessible name.

---

## Expanded state tells the truth

`toHaveTruthfulExpandedState()`, `findExpandedStateMismatches(page, { within })`

**What it does.** It finds every element with `aria-expanded`, and every
button or `input type="button"` with `popovertarget` or `commandfor`. A
`<summary>` is checked only when it carries `aria-expanded`. It pairs each
one with its target: `aria-controls`, the popover or command target, or the
`<details>` a `<summary>` opens. Then it compares the state the element
reports with whether the target can be seen, three times: at rest, after one
press, and after a second press. It presses Enter, then Space if Enter
changed nothing, then clicks.

It is careful with the page:

- It never presses a link, or a submit, reset or image button that belongs to
  a form, whatever its role.
- It presses a key only after confirming that the element itself has focus,
  so a key never lands on whatever focus moved to.
- Afterwards it tries to put every widget back as it was: it sets native
  popovers and `<details>` back directly and, if anything still differs,
  presses Escape, then presses each widget that still differs once more. A widget that cannot be undone, such
  as a "show more" button that hides itself, stays changed. Focus goes back
  to where it was.

For a native invoker (`popovertarget`, a popover command, `<summary>`) the
state that counts is the native one, because that is what the browser
exposes. As in HTML-AAM, an invoker inside its own popover, or one whose
target is not a popover, has no native state.

| Severity | Criteria | When |
|---|---|---|
| failure | 4.1.2 | The reported state and the target disagree |
| failure | 2.1.1 | A click toggles it but Enter and Space do not, or it cannot take focus |
| failure | 2.1.1 | Enter or Space toggles it, but it is not a tab stop and sits in no widget that moves focus with arrow keys (toolbar, menu, tab list, grid, tree, listbox, radio group) |
| warning | 4.1.2 | A native invoker carries an `aria-expanded` attribute that contradicts its native state. In Chromium it is a failure if the accessibility tree follows the attribute |
| warning | 4.1.2 | Pressing and clicking changed nothing |
| warning | none | Chromium's accessibility tree disagrees with the native state: a browser problem, not the page's |

**Visible** means rendered with a content box larger than its borders, and
not hidden by `display`, `visibility` or `opacity: 0`. Content in an
off-screen `content-visibility: auto` section, scrolled away or covered still
counts as visible.

**What it does not prove.** That the target holds the right content. An
element is pressed only when it acts as a button; `aria-expanded` on a
combobox, tree item or row is checked at rest only. Disclosures inside a
panel that is collapsed when the check starts are not pressed. Chromium's
accessibility tree is read in the top frame only.

## A dialog holds focus and gives it back

`toOpenADialogThatHoldsFocus({ close, returnTo, presses })`,
`walkModal(opener, options)`

**What it does.** It focuses the opener and presses Enter, falling back to a
click and reporting that. It finds the dialog: the opener's named target,
else a modal `<dialog>` that was not open before, else a dialog or popover
that appeared. It checks that focus moved in. It presses Tab, then
Shift+Tab: as many times as the dialog has stops, counted through shadow
roots, plus two, at least 3 and at most 100, or `presses`. Then it presses
Escape and checks that focus came back to the opener, or to `returnTo`.

Focus may leave the page for the browser's own toolbar, as a native modal
`<dialog>` allows, as long as it comes back into the dialog within 20
presses. Landing on the page behind is the failure; never coming back is a
warning.

| Severity | Criteria | When |
|---|---|---|
| failure | 2.4.3 | A modal dialog (`showModal()` or `aria-modal`) opened and focus stayed outside it |
| failure | 2.4.3 | Tab or Shift+Tab moved focus out of a modal dialog to the page behind. If the dialog covers that element, 2.4.11 may fail too |
| failure | none | The same for a dialog that is not modal. WCAG allows that when the dialog follows its opener in the focus order; it fails only the behaviour the matcher asks for |
| failure | 2.4.3 | The dialog closed when Tab moved focus (no criterion if it is not modal) |
| failure | 2.4.3 | Focus did not return to the opener, or to `returnTo`, when the dialog closed |
| failure | 2.1.1 | Enter on the opener opened nothing, a click did, or the opener cannot take focus |
| failure | none | Neither Enter nor a click opened anything that looks like a dialog |
| warning | 2.4.3 | Focus left the page and 20 presses did not bring it back into the dialog |
| warning | 2.1.2 | Escape does not close it; pass `close` to finish the walk with a close control |
| failure | 2.1.2 | Neither Escape nor the `close` control closes it |

WCAG's own example also accepts focus returning to the element after the
opener. This check is stricter: pass `returnTo` when focus should go
elsewhere.

**What it does not prove.** It walks the keyboard only. A dialog can hold
keyboard focus while a screen reader's reading cursor still wanders into the
page behind; `showModal()` and `inert` prevent both, a hand-built trap often
only the first. It does not check that the dialog has a name.

## Errors are tied to their fields

`toHaveErrorsTiedToFields({ errors })`, `findUntiedErrors(page, { within, errors })`

Run it after a failed submit.

**What it does.** Every field marked `aria-invalid` needs a non-empty message
tied to it: by `aria-errormessage` or `aria-describedby` on the field or on
its `<fieldset>` or group, or as error text inside its label. And every
visible error message that sits next to a single field, or a single radio
group, must be tied to it: referenced by `aria-describedby` or
`aria-errormessage`, or part of the field's label. A referenced wrapper that
also holds fields, such as a dialog's description, does not count.

Error messages are found by the selector
`[id*="error" i], [class*="error" i], [role="alert"]`. A match is left out
when it is a field, a heading, a form, a fieldset, a label or a legend, when
it is hidden or empty, when it contains a field or a link (an error summary
of links is fine), or when it contains a smaller match. "Next to" means the
nearest wrapper that holds fields, climbing no further than a form,
fieldset, section, article, search or dialog, and never into `body`, `main`, the
header, footer, navigation or an aside. Pass `errors` to use your own
selector.

A field that is invalid only by the browser's own validation, with no
message of the page's own, passes: the browser shows and exposes its own
message.

| Severity | Criteria | When |
|---|---|---|
| failure | 3.3.1 | A field marked invalid has no message tied to it, or an empty one. If the page describes the error elsewhere, such as in a summary, this is a 1.3.1 matter instead |
| failure | 1.3.1 | A visible error next to a field is not tied to it |
| warning | 3.3.1 | The tied message is hidden from view |

**What it does not prove.** That the message helps (3.3.3), that it is
announced when it appears (4.1.3), or that a description tied to the field
is an error and not a hint: a field described only by a hint passes.

---

## Engine notes

Measured on 27 October 2026 on macOS with Playwright 1.64.1, which runs
Chromium 156, Firefox 157 and WebKit 27.2. Playwright's WebKit is not Safari,
and its Firefox has no browser toolbar, so none of this is a claim about a
browser someone uses.

- **WebKit's Tab reaches only text fields and selects on macOS**, and skips
  buttons, links and checkboxes, as Safari does by default. The walk presses
  Alt+Tab there, as Option+Tab does in Safari. WebKit on Linux was not
  measured.
- **Each engine handles the edge of a modal differently.** None of them lets
  focus reach the page behind a `showModal()` dialog or an inert page.

  | Engine | Tab past the last control |
  |---|---|
  | Chromium | Leaves the page, then comes back to the first control |
  | Firefox | Stays on the last control |
  | WebKit | Leaves the page, then comes back. A native `<dialog>` takes focus itself first, then its first control |

  Shift+Tab before the first control mirrors this in Chromium and WebKit.
  Firefox moves focus to a native `<dialog>` itself and keeps it there.
- **WebKit, nested modal dialogs:** with one `showModal()` dialog opened from
  another, Tab past the last control of the inner one leaves the page and
  does not come back, so the walk warns. Shift+Tab cycles normally. Not
  checked in Safari.
- **Chromium, a CSS carousel behind a modal:** its `::scroll-button` and
  marker group add blank Tab stops behind a `showModal()` dialog. Nothing on
  the page takes focus there and nothing can be pressed, so the walk counts
  them as focus leaving the page.
- **Chromium's accessibility tree ignores a stale `aria-expanded` on a native
  invoker.** A `popovertarget` button or a `<summary>` written with
  `aria-expanded="false"` reports expanded once it opens. Firefox and WebKit
  do not expose their trees through Playwright, so for them the check warns
  instead of guessing.
- **Playwright's own expanded state reads the `aria-expanded` attribute, and
  `open` on a `<details>` element, nothing else.** Its
  `getByRole({ expanded })` ignores `popovertarget` and `commandfor`, against
  HTML-AAM §3.6.109 (`popovertarget`) and §3.6.25 (`command` in the popover
  states), so for the stale button above it matches `expanded: false` where
  Chromium reports expanded. This package reads the native state instead.
- **Playwright 1.65** (not out yet) hides inert content and the page behind a
  modal `<dialog>` from role queries, and makes clicks wait on inert
  elements. These checks press keys and read the DOM, which 1.65 does not
  gate. They click only as a fallback; 1.65 makes that click wait on an
  inert element, which 1.64 could not hit either.

## Why only these three

Reflow, text spacing, focus visibility and focus not obscured are already
packaged, by `@a11y-skills/audit` (MIT) and the A11y Pulse audits (PolyForm
Shield, source-available). `@a11y-skills/audit` also flags modals that do
not take focus or give it back, as candidates. When this package started, we
found no open-source package that compares expanded state with its target
after pressing it, walks Tab and Shift+Tab through a modal, or checks that
visible errors are tied to their fields.

Made by Thomas Sweet, alongside
[accessible-by-default.dev](https://accessible-by-default.dev).

## Licence

MIT
