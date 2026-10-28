# @accessible-by-default/checks

[![CI status](https://github.com/ThomasSweet/behaviour-checks/actions/workflows/ci.yml/badge.svg)](https://github.com/ThomasSweet/behaviour-checks/actions/workflows/ci.yml)
[![Playwright 1.64 or later](https://img.shields.io/badge/Playwright-1.64_or_later-2563eb)](https://playwright.dev)
[![Tested in Chromium, Firefox and WebKit](https://img.shields.io/badge/tested_in-Chromium_%C2%B7_Firefox_%C2%B7_WebKit-16a34a)](#engine-notes)
[![License: MIT](https://img.shields.io/badge/license-MIT-8a8a8a)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/@accessible-by-default/checks?color=2563eb)](https://www.npmjs.com/package/@accessible-by-default/checks)

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
needs Node 20.19 or later in the 20 line, or 22.12 or later: the first
releases that can `require()` an ES module, which a test file compiled to
CommonJS does. Node 20 itself is past its end of life. Every pull request
installs the packed package in a new project, on Node 20.19, 22.12 and 24
with Playwright 1.64.0 and on Node 26 with the latest Playwright, and runs the
matchers from CommonJS and from an ES module.

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
  "code": "expanded-state/state-contradicts-target",
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

`code` names the kind of finding, such as `modal-walk/escape-does-not-close`.
It stays the same from one version to the next, so match on it in scripts,
baselines and allow-lists. `what` is a sentence for people and can be
reworded in any release. A new kind of finding gets a new code, and a code is
never renamed or reused. The tables below list every code, and a matcher
ends each finding it lists with its code, in a failure message or an
`accessibility warning` annotation.

### Versions

While the version starts with 0, a minor release, such as 0.3.0, can change
what a check reports: a new code, a check that finds more, or a code with a
different severity or criteria. A patch release, such as 0.2.1, changes none
of that, except to remove a finding that was wrong. `what` can change in any
release. If your tests assert exact findings, pin an exact version.

---

## Expanded state tells the truth

`toHaveTruthfulExpandedState()`, `findExpandedStateMismatches(page, { within })`

**What it does.** It finds every element with `aria-expanded`, every button
or `input` with `popovertarget`, and every button with
`commandfor`. A `<summary>` is checked only when it carries `aria-expanded`.
It pairs each one with its target: `aria-controls`, the popover or command
target, or the `<details>` a `<summary>` opens. As in HTML, a `commandfor`
with a known or custom (`--`) command wins over `popovertarget`, and command
keywords match in
any case. With a missing or unknown command, or a dialog command aimed at
something that is not a dialog, HTML runs neither, while Chromium runs
`popovertarget`; the check follows the engine it runs in. Only an enabled
button, or an `input` of type button, submit, reset or image that does not
submit or reset a form, gets a native state: a disabled button or any other
element that carries `popovertarget` or `commandfor` activates nothing, so the
check compares its `aria-expanded` with the target it names. Then
it compares the state the element reports with whether the target can be
seen, three times: at rest, after one
press, and after a second press. It presses Enter, then Space if Enter
changed nothing, then clicks.

It is careful with the page:

- It never presses a link, or a submit, reset or image button that belongs to
  a form, whatever its role.
- It presses a key only after confirming that the element itself has focus,
  so a key never lands on whatever focus moved to.
- It does not press a button that can only show a popover that is already
  open, or only hide one that is closed, because nothing could change.
- Afterwards it tries to put every widget back as it was: it sets native
  popovers and `<details>` back directly and, if anything still differs,
  presses Escape, then presses once more each widget whose own reported state
  still differs. It never presses a control it did not check. A widget that
  cannot be undone, such as a "show more" button that hides itself, or a
  dialog a `close` command closed, stays changed. Focus goes back to where it
  was.

For a native invoker (`popovertarget`, a popover command, `<summary>`) the
state that counts is the native one, because that is what the browser
exposes. As in
[HTML-AAM](https://w3c.github.io/aria/html-aam/#att-popovertarget), an
invoker inside its own popover, or one whose target is not a popover, has no
native state.

| Code | Severity | Criteria | When |
|---|---|---|---|
| `expanded-state/state-contradicts-target` | failure | 4.1.2 | The reported state and the target disagree, at rest or after a press |
| `expanded-state/pointer-only` | failure | 2.1.1 | A click toggles it, but Enter and Space do not |
| `expanded-state/cannot-take-focus` | failure | 2.1.1 | It cannot take focus, and a click toggles it |
| `expanded-state/not-a-tab-stop` | failure | 2.1.1 | Enter or Space toggles it, but it is not a tab stop and sits in no widget that moves focus with arrow keys (toolbar, menu, tab list, grid, tree, listbox, radio group) |
| `expanded-state/aria-expanded-overrides-native-state` | failure | 4.1.2 | A native invoker carries an `aria-expanded` attribute that contradicts its native state, and Chromium's accessibility tree follows the attribute |
| `expanded-state/aria-expanded-contradicts-native-state` | warning | 4.1.2 | The same, where Chromium's accessibility tree ignores the attribute, or the engine's tree cannot be read |
| `expanded-state/press-changes-nothing` | warning | 4.1.2 | Pressing and clicking changed nothing |
| `expanded-state/browser-misreports-native-state` | warning | none | Chromium's accessibility tree disagrees with the native state: a browser problem, not the page's |

**Visible** means rendered with a content box larger than its borders, and
not hidden by `display`, `visibility` or `opacity: 0`. Content in an
off-screen `content-visibility: auto` section, scrolled away or covered still
counts as visible.

**What it does not prove.** That the target holds the right content. An
element is pressed only when it acts as a button; `aria-expanded` on a
combobox, tree item or row is checked at rest only. Disclosures inside a
panel that is collapsed when the check starts are not pressed. Chromium's
accessibility tree is read only for elements in the top frame's document,
outside shadow roots.

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
presses. Landing on the page behind is the failure, also when a script blurs
that element at once and leaves nothing focused. A script that moves focus
straight back into the dialog passes, as focus traps that redirect do. Never
coming back is a warning. Focus on the native modal `<dialog>` that wraps the
dialog counts as inside it; focus on any other element around the dialog is
the page behind.

The walk tells these apart by listening for focus events during each press.
An element behind a `showModal()` dialog, or under an `inert` attribute or
`interactivity: inert`, is inert and should never take focus, so when one
takes it and loses it at once, that is a browser bug and only a warning. If
the page itself changes an `inert`, `class` or `style` attribute during that
press, the walk cannot tell that the element was inert before, so the stop
counts as the page's failure, unless it lies behind a `showModal()` dialog.
Behind a dialog that is modal only through `aria-modal`, the page is
focusable unless the page makes it inert, so there an element that takes
focus is the page's failure.

| Code | Severity | Criteria | When |
|---|---|---|---|
| `modal-walk/focus-does-not-move-in` | failure | 2.4.3 | The dialog opened and focus stayed outside it |
| `modal-walk/tab-reaches-page-behind` | failure | 2.4.3 | Tab or Shift+Tab moved focus out of the dialog to the page behind, and it stayed there, or a script blurred it and left nothing focused. If the dialog covers that element, 2.4.11 may fail too |
| `modal-walk/tab-closes-dialog` | failure | 2.4.3 | The dialog closed when Tab or Shift+Tab moved focus |
| `modal-walk/focus-does-not-return` | failure | 2.4.3 | Focus did not return to the opener, or to `returnTo`, when the dialog closed |
| `modal-walk/enter-does-not-open` | failure | 2.1.1 | Enter on the opener opened nothing, a click did |
| `modal-walk/opener-cannot-take-focus` | failure | 2.1.1 | The opener cannot take focus; a click opened the dialog |
| `modal-walk/no-dialog-opens` | failure | none | Neither Enter nor a click opened anything that looks like a dialog |
| `modal-walk/blank-stop-behind-dialog` | warning | none | An inert element behind the dialog took focus and lost it at once: a browser bug the page cannot fix, but a keyboard user still lands there |
| `modal-walk/focus-stays-off-page` | warning | 2.4.3 | Focus left the page and 20 presses did not bring it back into the dialog |
| `modal-walk/escape-does-not-close` | warning | 2.1.2 | Escape does not close it; pass `close` to finish the walk with a close control |
| `modal-walk/close-control-does-not-close` | failure | 2.1.2 | Neither Escape nor the `close` control closes it |

A dialog is modal when it was opened with `showModal()` or has
`aria-modal="true"`. For a dialog that is not modal, the first three codes
name no criterion: WCAG allows focus to leave such a dialog when it follows
its opener in the focus order, so they fail only the behaviour the matcher
asks for.

WCAG's own example also accepts focus returning to the element after the
opener. This check is stricter: pass `returnTo` when focus should go
elsewhere.

**What it does not prove.** It walks the keyboard only. A dialog can hold
keyboard focus while a screen reader's reading cursor still wanders into the
page behind; `showModal()` and `inert` prevent both, a hand-built trap often
only the first. It does not check that the dialog has a name. It presses at
most 100 times in a row while focus is outside the dialog. A `showModal()`
dialog inside a shadow root is found only through `aria-controls` or
`commandfor` on the opener.

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

| Code | Severity | Criteria | When |
|---|---|---|---|
| `error-association/invalid-field-has-no-message` | failure | 3.3.1 | A field marked invalid has no message tied to it. If the page describes the error elsewhere, such as in a summary, this is a 1.3.1 matter instead |
| `error-association/tied-message-is-empty` | failure | 3.3.1 | A field marked invalid points at a message, and every message it points at is empty |
| `error-association/tied-message-is-hidden` | warning | 3.3.1 | The tied message is hidden from view |
| `error-association/visible-error-is-not-tied` | failure | 1.3.1 | A visible error next to a field is not tied to it. It replaces any other finding for that field |

**What it does not prove.** That the message helps (3.3.3), that it is
announced when it appears (4.1.3), or that a description tied to the field
is an error and not a hint: a field described only by a hint passes.

---

## Engine notes

Measured on 27 and 28 October 2026 on macOS with Playwright 1.64.1, which runs
Chromium 156, Firefox 157 and WebKit 27.2. The fixture tests give the same
findings on Ubuntu, in this repository's CI. Playwright's WebKit is not Safari,
and its Firefox has no browser toolbar, so none of this is a claim about a
browser someone uses.

- **WebKit's Tab reaches only text fields and selects on macOS**, and skips
  buttons, links and checkboxes, as Safari does by default. The walk presses
  Alt+Tab in WebKit on every platform, as Option+Tab does in Safari.
- **Each engine handles the edge of a modal differently.** None of them
  leaves focus on the page behind a `showModal()` dialog or an inert page,
  though in two cases below, a CSS carousel in Chromium and nested dialogs in
  WebKit, an inert element takes focus for a moment and loses it at once.

  | Engine | Tab past the last control |
  |---|---|
  | Chromium | Leaves the page, then comes back to the first control |
  | Firefox | Stays on the last control |
  | WebKit | Leaves the page, then comes back. A native `<dialog>` takes focus itself first, then its first control |

  Shift+Tab before the first control mirrors this in Chromium and WebKit.
  Firefox moves focus to a native `<dialog>` itself and keeps it there.
- **WebKit, nested modal dialogs:** with one `showModal()` dialog opened from
  another, Tab past the last control of the inner one leaves the page and
  does not come back, so the walk warns. On the way out, the outer dialog,
  which is inert, takes focus and loses it at once, and the walk reports
  that as a browser bug too. Shift+Tab cycles normally. Not checked in
  Safari.
- **Chromium, a CSS carousel behind a modal:** each `::scroll-marker` adds a
  Tab stop behind a `showModal()` dialog, although everything behind a modal
  is inert. The slide the marker belongs to takes focus and loses it within
  milliseconds, so nothing visible is focused. An Enter or Space that arrives
  before focus drops, within about a millisecond on an idle page or before
  the next frame on an animating one, activates the marker and scrolls the
  inert carousel while the dialog stays open. It
  happens on the first pass after each time the page behind becomes inert,
  also under an `inert` attribute set by script, and only if the carousel had
  rendered first. `::scroll-button()` adds no stop. The walk reports these
  stops as `modal-walk/blank-stop-behind-dialog`. Reading Chromium's
  accessibility tree through CDP after the dialog opens hides them for that
  opening. Firefox 157 and WebKit 27.2 do not support these pseudo-elements.
  [A draft bug report](docs/upstream/chromium-scroll-marker-inert.md) waits to
  be filed.
- **Chromium's accessibility tree ignores `aria-expanded` on a native
  invoker and reports the native state.** A `popovertarget` button, a
  `commandfor` button with a popover command, or a `<summary>` written with
  `aria-expanded="false"` reports expanded once it opens, and one written
  with `aria-expanded="true"` reports collapsed while it is closed. An invoker
  inside its own popover, or a `commandfor` button with any other command and
  no `popovertarget`, keeps its attribute. With `popovertarget` as well,
  Chromium's tree follows the `popovertarget` popover, although HTML runs only
  the command. With a missing or unknown command, Chromium runs
  `popovertarget`, which HTML does not. Firefox and WebKit do not expose their
  trees through Playwright, so for them the check warns instead of guessing.
- **Playwright's own expanded state reads the `aria-expanded` attribute, and
  `open` on a `<details>` element, nothing else.** Its
  `getByRole({ expanded })` ignores `popovertarget` and
  `commandfor`, although HTML-AAM maps `aria-expanded` for
  [`popovertarget`](https://w3c.github.io/aria/html-aam/#att-popovertarget)
  and for
  [`command` in the popover states](https://w3c.github.io/aria/html-aam/#att-command-popovers):
  "If the associated element is displayed as a popover: aria-expanded=true"
  (Editor's Draft of 26 October 2026). So for a stale button it matches
  `expanded: false` where Chromium reports expanded. For a plain
  `<details>`, whose role is group, `ariaSnapshot()` shows no state. This
  package reads the native state instead.
- **Playwright 1.65** (not out yet) hides inert content and the page behind a
  modal `<dialog>` from role queries, and makes clicks wait on inert
  elements. These checks press keys and read the DOM, which 1.65 does not
  gate. They click only as a fallback; 1.65 makes that click wait on an
  inert element, which 1.64 could not hit either.

## Why only these three

Reflow, text spacing, focus visibility and focus not obscured are already
packaged, by `@a11y-skills/audit` (MIT) and the A11y Pulse audit packages
(PolyForm Shield 1.0.0, source-available; their plumbing packages
`tab-orchestrator`, `browser-adaptor` and `audit-runner` are MIT).
`@a11y-skills/audit` also flags modals that do not take focus or give it
back, as candidates: it opens them from triggers it recognises with Enter and
closes them with Escape or a close button, but presses no Tab inside. When
this package started, we found no open-source package that compares expanded
state with its target after pressing it, walks Tab and Shift+Tab through a
modal, or checks that visible errors are tied to their fields.
`@a11y-skills/audit` 0.18.0, the latest on 28 October 2026, still does none of
the three.

## Contributing

A check that got a page wrong is the most useful report, with the smallest
page that shows it. [CONTRIBUTING.md](CONTRIBUTING.md) explains the setup and
the rules for a change, and [CHANGELOG.md](CHANGELOG.md) lists what changed.
Security problems go to [SECURITY.md](SECURITY.md).

Made by Thomas Sweet, alongside
[accessible-by-default.dev](https://accessible-by-default.dev).

## Licence

[MIT](LICENSE)
