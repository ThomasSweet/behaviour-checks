# Behaviour checks: scope

Written 26 October 2026 and agreed the same day, with every recommendation in
the last section taken. Version 1 was built on 27 October; the README is now
the source of truth for what each check does, and this file is the record of
why. It narrows `new-project-brief.md` (Desktop) into what version 1 builds.
The prior-art re-check below found packages the brief did not know about, so
where the two differ, this one has the later facts.

---

## In one paragraph

An npm package of Playwright matchers and helpers that operate a page's
interactive widgets by keyboard, in Chromium, Firefox and WebKit, and check
that they behave as they claim. A disclosure that says it is collapsed hides
its panel. A modal holds focus and gives it back. An error is tied to its
field. These are the failures screen reader users rank second, after
CAPTCHAs: menus, tabs and dialogs that do not behave as expected (WebAIM
survey 2024, via the research document). Each check returns its findings as
data, and each matcher fails a test with that list. It sits next to axe, not
in place of it, and a pass is not conformance.

---

## Re-checked on 26 October 2026

**Playwright.** The latest stable is 1.64.1 (14 October). 1.65 is not out.
PR #43211, merged 8 October, ships in 1.65. It hides inert content and
everything outside the topmost `dialog:modal` from `getByRole` and aria
snapshots, and covers native modals only, not `aria-modal`. It also makes
click, fill, check and similar wait on an inert element and then time out;
press, focus and hover are not gated. An earlier attempt was reverted in
August 2025, so treat it as shipped only once it ships.

**Expanded state.** Playwright's `getAriaExpanded` reads `<details open>` and
the `aria-expanded` attribute only. I read it in the installed 1.64.1, and
the research agent read it on main. Neither has `popover` or `command`
logic, and no issue asks for it. HTML-AAM (the Editor's Draft of 26 October,
now at w3c.github.io/aria/html-aam) maps a
[`popovertarget`](https://w3c.github.io/aria/html-aam/#att-popovertarget)
invoker to `aria-expanded=true` when its popover is "displayed as a
popover", and
[`command` in the popover states](https://w3c.github.io/aria/html-aam/#att-command-popovers)
does the same.
The upstream issue in task 6 is still new.

**Prior art the brief missed.** Two projects appeared in the last two
months:

| Package | Licence | Engines | Overlap with the brief |
|---|---|---|---|
| `@a11y-skills/audit` 0.18.0, 25 Oct, about 440 downloads a week | MIT | Playwright. Several checks use CDP, so they are Chromium only | Focus indicator with 2.4.11 and 2.4.12, reflow, text spacing, 200% zoom, keyboard trap. Its focus-order check flags modals that do not take or return focus, as candidates. Its README says it does not examine Tab cycling inside a modal |
| A11y-Pulse audits: focus-not-obscured 0.4.0, reflow 0.3.0, text-spacing 0.3.0, keyboard-trap 0.1.0, about 100 downloads each | PolyForm Shield 1.0.0: source-available with a non-compete clause, not open source | Playwright adaptor with Firefox and WebKit | 2.4.11, 1.4.10, 1.4.12, 2.1.2 |

Also: axe-core 4.14 already has `identical-links-same-purpose`, the
distinct-names check, but it is off by default, tagged AAA (2.4.9) and needs
review. I confirmed that in the installed copy. `@react-aria/test-utils` and
the Evinced Unit Tester are as the brief says: jsdom, no focus return, and
Evinced is still private.

**Still in no open-source package we found:** the expanded-state sweep, a
modal walk that proves Tab and Shift+Tab cannot leave, and a page-wide check
that errors are tied to their fields. Evinced's private tester covers the
first two, on jsdom rather than in a browser.

---

## What this changes

Three of the brief's five seeds now exist elsewhere: cut-off content, focus
not hidden and focus visible. A third take on them would compete on engine
handling alone, and that is hard to show from a README. The three gap
checks are open, and they are the widget behaviour users report most. So
version 1 is those three. The seeds stay in the site's suite, where they
work today. Distinct names is dropped: the docs tell people to turn on
axe's rule instead.

---

## The checks

| # | Check | What it does | Criteria | Reports |
|---|---|---|---|---|
| 1 | Expanded state tells the truth | Pairs each invoker with its target (`aria-controls`, `popovertarget`, `commandfor`, `<summary>`). Toggles it by keyboard, never a link or a submit button. Compares the reported state with the target's visibility before and after | 4.1.2 | failure |
| 2 | Modal keyboard walk | Opens the dialog from its opener, presses Tab and Shift+Tab past every control, closes with Escape. Focus never lands on the page behind, and it returns to the opener | 2.4.3; 2.1.2 for the way out | failure |
| 3 | Errors tied to fields | After a failed submit, every invalid field has a non-empty error message or description, and every visible error is referenced by a field (`aria-errormessage` or `aria-describedby`) | 3.3.1, 1.3.1 | failure |

---

## Ground truth

The two practice rooms cannot measure these checks. They have no widgets,
by design, so all three checks would report nothing there, which proves
nothing. Recall comes from two places:

- **Fixtures in the package**: a passing and a failing page per check, run
  in all three engines in its own CI.
- **The next two rooms, if you want them to carry it.** The practice-room
  plan already has P·03, a settings room, and P·04, a booking form. Both can
  plant these barriers without script, which keeps the rooms' rule:
  - P·03 can have a button with a hard-coded `aria-expanded` that never
    changes.
  - P·04 can have a form shown after a failed submit, its errors printed
    next to the fields but not tied to them.
  - Either room can have a `popover` dressed as a modal. It opens with
    `popovertarget`, takes no focus and lets Tab walk the page behind.

  Invokers made dialogs and popovers script-free, which is the site's
  thesis, so the rooms would also argue the site's case.

**False positives** come from the site's clean pages, which use these
widgets for real:

- The theme panel, popover menu and anchor popover use `popovertarget`.
- The invoker demo uses `commandfor`.
- `AppDialog` opens with `showModal()`.
- The craft form leaves validation to the browser.

One known risk: Firefox reports stale computed visibility on an anchored
element with a `position-try` fallback (GUIDE, "Anchored elements"). Check
1 must not read that as a mismatch.

The site gains something back. Its dialog spec never presses Tab (known
debt). Importing check 2 fixes that.

---

## API sketch

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

A matcher on a locator scopes its check to that element. Each matcher fails
with the findings list. The same checks are available as data
(`findExpandedStateMismatches(page, { within })` and so on), for anything
that is not a test:

```json
[
  {
    "check": "expanded-state",
    "severity": "failure",
    "criteria": ["4.1.2"],
    "element": { "selector": "header button.menu-toggle", "role": "button", "name": "Menu" },
    "what": "reports collapsed while its target #site-menu is visible, after Enter",
    "context": { "engine": "firefox", "viewport": [1280, 800] }
  }
]
```

**CLI, later.** It would run check 1 against a URL, and check 2 on every
opener it can find (`commandfor` with `show-modal`, `aria-haspopup="dialog"`,
`aria-controls` pointing at a dialog). Check 3 stays test-only: submitting
forms on a URL is a side effect.

---

## Engine handling

The GUIDE's traps apply as written ("Engine behaviours we work around", "In
tests"). Four shape the design:

- **Keys.** WebKit presses Alt+Tab and Alt+Shift+Tab, chosen by the package,
  not the caller. Every press waits for focus and scroll to settle
  (`focusSettled`).
- **Native invokers.** Playwright computes states in its own script and has
  no API for the browser's own accessibility tree. Only Chromium exposes that
  tree, over CDP. So for a native invoker with no author ARIA, check 1
  verifies the browser's mapping in Chromium and trusts it in Firefox and
  WebKit. Everywhere, it catches the author's own `aria-expanded` going
  stale, or one that contradicts the native state.
- **Native modals.** A `showModal()` dialog lets Tab leave for the browser's
  own UI. Check 2 allows focus to leave the document, as long as the next
  Tab brings it back into the dialog. It fails only when focus lands on the
  page behind.
- **Playwright 1.65.** The checks act through the keyboard and the DOM, and
  1.65 does not gate press or focus, so its inert changes should not affect
  them. Re-run the fixtures the day it ships.

Every result names its engine as Playwright runs it, never as a browser
brand: "WebKit 27.2 via Playwright", not "Safari".

---

## Not in version 1

- The seed checks: cut-off content, focus not hidden, focus visible,
  reduced motion and contrast.
- Distinct names, which axe already has.
- Scores, dashboards and a hosted scanner.
- Any claim about Windows screen readers.

The parked ideas stay parked for the brief's reasons.

---

## Decisions for Thomas

My recommendation first in each.

1. **Version 1 is the three gap checks.** The alternative is porting the
   seeds as well and competing with `@a11y-skills/audit` on engine handling.
2. **Name: a scope, `@accessible-by-default/…`.** It ties the package to
   the site by name only, and no one has claimed the scope (npm, 26
   October). The first package could be `@accessible-by-default/checks`.
   Unscoped, `a11y-behaviour` and `behaviour-checks` are free; so is the
   American `a11y-behavior`, which is what most people would type.
3. **Repository: separate.** The first prompt asked for its own thing. The
   site is `private: true` with a long three-engine CI, and a package is
   found on npm and GitHub, where its README is the front door.
4. **Licence: MIT.** It matches the site, and it is the plain difference
   from A11y-Pulse.
5. **Playwright floor: 1.64.** Nothing here depends on 1.65.
6. **CLI after the library.** 0.1 is the library. A later minor version adds
   the CLI and the agent skill together, because the skill calls the CLI.
   They were planned for 0.2, which went to stable finding codes instead
   (28 October).
7. **Docs in the package**, one page per check: what it proves, what it
   does not, and the engine traps. The proof chapter gets one section that
   links there.
8. **Ground truth: plant these barriers in P·03 and P·04**, script-free, as
   above. This is your call on the rooms' content and order. Without it,
   the public recall numbers come from the package's own fixtures only.
