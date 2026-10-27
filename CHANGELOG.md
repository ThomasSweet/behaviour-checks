# Changelog

Notable changes to `@accessible-by-default/checks`. Versions follow
[Semantic Versioning](https://semver.org). While the version starts with 0,
a minor release can change what a check reports.

## 0.1.0 (2026-10-28)

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
