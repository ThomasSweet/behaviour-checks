# Changelog

Notable changes to `@accessible-by-default/checks`. Versions follow
[Semantic Versioning](https://semver.org). While the version starts with 0,
a minor release can change what a check reports.

## 0.2.0 (2026-10-28)

This release changes what the checks report. If your tests assert exact
findings, read this list before you upgrade.

- Every finding has a `code`, such as `modal-walk/escape-does-not-close`, that
  stays the same between versions. Match on it instead of the `what` text.
  A matcher ends each finding it lists with its code, in a failure message
  and in an `accessibility warning` annotation, and the README lists every
  code. `FindingCode` is exported.
- The modal walk now catches focus that reaches the page behind a dialog and
  is blurred by a script at once, leaving nothing focused
  (`modal-walk/tab-reaches-page-behind`). Before, Chromium and Firefox missed
  it. A script that moves focus straight back into the dialog still passes.
  The walk listens for both `focus` and `focusin`, so a page that stops one
  of them cannot hide the leak.
- The modal walk warns when an inert element behind the dialog takes focus
  and loses it at once (`modal-walk/blank-stop-behind-dialog`), a browser bug
  that Chromium shows with a CSS carousel's `::scroll-marker`, and WebKit
  when Tab leaves a `showModal()` dialog opened from another one. Inertness
  counts from `showModal()`, the `inert` attribute and `interactivity: inert`,
  through shadow roots and slots. If the page changes an `inert`, `class` or
  `style` attribute during the press, the stop counts as the page's failure,
  unless it lies behind a `showModal()` dialog. Before, these stops passed as
  focus leaving the page, and 20 of them in a row gave a false
  `modal-walk/focus-stays-off-page` warning.
- Focus on a native modal `<dialog>` that wraps the walked dialog now counts
  as inside it. Before, Firefox and WebKit reported a `showModal()` wrapper
  around a `role="dialog"` as the page behind.
- Tab stops inside the dialog's own shadow root are found, so a dialog that
  is a shadow host no longer gets a false Escape warning.
- Content slotted into a `<dialog>` that lives in a shadow root now counts as
  inside it. Before, focus there was reported as the page behind, a false
  failure in every engine.
- The walk no longer stops with an error when the element it reports has
  been removed from the page.
- The expanded-state check matches `command` keywords in any case, and a
  `commandfor` with a known or custom (`--`) command wins over
  `popovertarget`, as in HTML.
  `commandfor` wins only when the browser resolves it on a button; on an
  `input`, or with an id it cannot resolve, `popovertarget` runs as before.
  With a missing or unknown command, or a dialog command aimed at something
  that is not a dialog, it follows the engine: HTML runs nothing, Chromium
  runs `popovertarget`. It no longer presses a button that can only show an
  open popover or only hide a closed one. These cases gave false failures
  and false warnings.
- Only an element that can activate gets a native state. A disabled button,
  or a submit button in a form, with `popovertarget` or `commandfor` gave a
  false native-state finding: the failure
  `expanded-state/aria-expanded-overrides-native-state` in Chromium, the
  warning `expanded-state/aria-expanded-contradicts-native-state` in Firefox
  and WebKit. Its `aria-expanded` is now compared with the target it names,
  so one that contradicts it is the failure
  `expanded-state/state-contradicts-target` in every engine.
- Putting widgets back never presses a control the check did not assess.
  Before, it could run a custom command, such as one that empties a list.
- An invoker inside its own popover's shadow tree now counts as inside it,
  as Chromium treats it. A contradicting `aria-expanded` there is now the
  failure `expanded-state/state-contradicts-target`, not the warning about a
  native invoker.
- A control that cannot take focus and changes nothing when clicked is now
  described as such, instead of as pressed with Enter and Space.
- In Firefox, focus is given back after the check when the last pressed
  invoker sits in a shadow root. Focus that started on an SVG element is
  given back too, and focus that started in a closed shadow root is no longer
  left on a widget the check pressed.

## 0.1.1 (2026-10-28)

- Published from GitHub Actions through npm trusted publishing, with a
  provenance statement that links the package to the commit and workflow run
  that built it. The checks themselves have not changed.

## 0.1.0 (2026-10-27)

- Three checks, each as a Playwright matcher and as a function that returns
  findings: expanded state against what is visible
  (`toHaveTruthfulExpandedState`, `findExpandedStateMismatches`), a keyboard
  walk through a modal dialog with focus return
  (`toOpenADialogThatHoldsFocus`, `walkModal`), and errors tied to their
  fields (`toHaveErrorsTiedToFields`, `findUntiedErrors`).
- Tested in Chromium, Firefox and WebKit with `@playwright/test` 1.64.1.
  Works with 1.64 or later.
- Runs on Node 20.19 or later in the 20 line, and on 22.12 or later. These
  are the releases that can `require()` an ES module.
