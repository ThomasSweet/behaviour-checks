# Contributing

Thank you for helping. Reports of a wrong result are the most useful thing
you can send: a check that flags a page that is fine, or misses one that is
not. Use the "A check got it wrong" issue form, with the smallest page that
shows it.

## What belongs here

A check belongs in this package when only operating the page can show the
problem: pressing keys, moving focus, and looking at what changed. If axe or
another rule engine can find it from the markup, it belongs there instead.
The README's "Why only these three" section says what is already covered
elsewhere.

## Setup

You need Node 24 or later and npm 11.16 or later for development. The
package itself supports older Node releases; see the README.

```bash
npm ci
npx playwright install --with-deps
```

| Command | What it does |
|---|---|
| `npm test` | Every fixture test in Chromium, Firefox and WebKit |
| `npx playwright test --project=webkit` | One engine only |
| `npm run typecheck` | Type-checks the source, tests and config |
| `npm run check:package` | Packs the package, installs it in a new project with the oldest supported Playwright, type-checks it, and runs the matchers from CommonJS and from an ES module. Set `PLAYWRIGHT_VERSION` to try another version |
| `npm run test:site` | Runs the checks against a local build of accessible-by-default.dev, to catch false results on a real site. It expects that repository next to this one, built with `npm run build` |

Playwright writes a JSON report to `reports/last-run.json`. Read the slowest
tests in it after a change.

## Rules for a change

- **Every finding has a fixture.** A page in `fixtures/` that passes, and one
  that fails on purpose, with a test that names the expected finding.
- **A fix comes with a regression test** that fails without the fix.
- **Run all three engines.** When they behave differently, measure it, then
  add it to the README's engine notes with the date and the versions.
- **WCAG criteria are claims.** Name a success criterion only when its
  Understanding document supports it. When a finding is not a WCAG failure,
  leave `criteria` empty and say so in the README table.
- **The README matches the code.** Severity, criteria and the "When" column
  of each table describe what the code does.
- **No code comments.** Put the reasoning in the pull request description.
- **Add a line to `CHANGELOG.md`** under the next version for anything a
  user would notice.

Commit messages start with `feat:`, `fix:`, `docs:` or `chore:`.

## Conduct

This project follows its [code of conduct](CODE_OF_CONDUCT.md).
