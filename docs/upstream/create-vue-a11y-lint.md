# create-vue proposal: lint templates for accessibility

Draft for Thomas to file at https://github.com/vuejs/create-vue/issues/new
with the "Feature request" template. Not filed. Every fact below was
checked on 27 October 2026.

## Why an issue, with the PR inside it

- create-vue's CONTRIBUTING.md says: "For any non-trivial new features or
  bug fixes, please open an issue first and have it approved before
  working on it." A new default dependency is non-trivial.
- Discussions are turned off on vuejs/create-vue. Its issue config sends
  questions to vuejs/core discussions, where this would be off-topic.
- So: an issue that makes the case and carries the diff, so a maintainer
  can say yes to something concrete. Open the PR once they agree.

## Verdict on the plugin

Usable, and the pitch stands, with two things said plainly in the body:

- **One recommended rule flags correct HTML.** `label-has-for` defaults to
  requiring that a label both wraps its control and points at it with
  `for`. It reports `<label for="name">Name</label><input id="name">` and
  `<label>Email <input type="email"></label>`, both valid. The proposal
  turns that down to "either", which I tested.
- **Maintenance is thin.** Four releases since August 2026, but no release
  at all between July 2024 and February 2026, and an open issue titled
  "Plugin is no longer being maintained" (#1454). It is maintained today,
  by few people.

## Before you file

1. Check eslint-plugin-vuejs-accessibility's latest release and the state
   of its issue #1454.
2. Re-measure the downloads. The npm API had gaps this month (see
   Sources), so use the latest Monday-to-Sunday week with no zero days.
3. Search create-vue issues again for `accessibility` and `a11y`.

---

## Title

```
Lint templates for accessibility when ESLint is selected
```

## Body

### Please describe

````markdown
When ESLint is selected, create-vue writes an `eslint.config` with eslint-plugin-vue's `flat/essential`, the JS or TypeScript recommended rules, and Oxlint. None of these check templates for accessibility. Oxlint's docs say it lints only the `<script>` blocks of `.vue` files, so it never sees the template, which is where most of these mistakes happen: an `<img>` without `alt`, an input without a label, a `<div @click>` the keyboard can't reach.

I'd like to propose adding [eslint-plugin-vuejs-accessibility](https://github.com/vue-a11y/eslint-plugin-vuejs-accessibility) to the config create-vue generates.

**Why by default.** Defaults decide what most projects run. In React, create-next-app selects ESLint by default and installs `eslint-config-next`, which depends on `eslint-plugin-jsx-a11y`. npm downloads for 28 September to 4 October 2026, the latest full week without gaps in npm's data:

| Package | Downloads |
|---|---:|
| eslint-plugin-react | 76,020,341 |
| eslint-plugin-jsx-a11y | 59,422,825 |
| eslint-config-next | 42,363,123 |
| eslint-plugin-vue | 8,185,476 |
| eslint-plugin-vuejs-accessibility | 743,390 |

That is about 78 jsx-a11y downloads for every 100 of eslint-plugin-react, and about 9 vuejs-accessibility downloads for every 100 of eslint-plugin-vue. Downloads count CI runs and transitive installs, not projects, so this is a rough ratio. But the gap is large, and it follows the default.

**What it checks.** `flat/recommended` turns on 20 rules, among them `alt-text`, `form-control-has-label`, `label-has-for`, `anchor-has-content`, `click-events-have-key-events`, `no-static-element-interactions`, `tabindex-no-positive` and `no-autofocus`. A new project is the cheapest place to catch these, before a component library grows around them.

**Compatibility.** I scaffolded three projects with create-vue 3.24.0:

- TypeScript and ESLint
- TypeScript, Router, Pinia, Vitest, Playwright, ESLint and Prettier
- JavaScript, Router, Pinia, Vitest and ESLint

Then I added the plugin and the config below and ran `eslint .`:

- The generated code passes in all three.
- npm resolved one copy each of eslint 10.13.0, eslint-plugin-vue 10.11.1 and vue-eslint-parser 10.4.1, with no peer warnings. The plugin's 2.6.3 accepts ESLint `^10.0.0` as a peer and depends on `vue-eslint-parser ^9.0.0 || ^10.0.0`.
- `<script setup lang="ts">` still parses. The plugin sets `vue-eslint-parser` for `*.vue`, and the TypeScript sub-parser from `@vue/eslint-config-typescript` survives the merge.
- A component with six planted faults (missing `alt`, `@click` on a `div`, an unlabelled input, an empty link, a positive `tabindex`) gets six errors.
- The plugin's base config adds browser globals to every file. The JS template already sets the same globals, and `no-undef` is off in the TS template, so this changes nothing.

**One rule needs an override.** `label-has-for` defaults to `required: { every: ['nesting', 'id'] }`, meaning a label must both wrap its control and point at it with `for`. It reports both of these, which are correct HTML:

```html
<label for="name">Name</label>
<input id="name" type="text" />

<label>
  Email
  <input type="email" />
</label>
```

eslint-plugin-jsx-a11y deprecated its rule of the same name in v6.1.0 and replaced it with `label-has-associated-control`. This plugin has an open issue asking for the same (vue-a11y/eslint-plugin-vuejs-accessibility#54). With `required: { some: ['nesting', 'id'] }`, both patterns pass and a `<label>` with no control is still reported. A control with no label is caught separately by `form-control-has-label`.

**Maintenance.** The plugin released 2.6.0 on 10 August, 2.6.1 and 2.6.2 on 7 October, and 2.6.3 on 21 October 2026. Before that there was no release between 2.4.1 (July 2024) and 2.4.2 (February 2026), and vue-a11y/eslint-plugin-vuejs-accessibility#1454, "Plugin is no longer being maintained", is still open. The work that followed it brought ESLint 10 support. It is maintained, by a small group, and that is worth weighing.

### Proposed change

Three template files.

`template/linting/base/package.json`

```diff
   "devDependencies": {
     "eslint": "^10.13.0",
     "eslint-plugin-vue": "~10.11.1",
+    "eslint-plugin-vuejs-accessibility": "^2.6.3",
     "vue-eslint-parser": "^10.4.1"
   }
```

`template/linting/core/ts/eslint.config.js.data.mjs`, after the `vueTsConfigs.recommended` entry, and the same entry in `template/linting/core/js/eslint.config.js.data.mjs`, after `pluginVue`:

```diff
+      {
+        importer: `import pluginVueA11y from 'eslint-plugin-vuejs-accessibility'`,
+        content: `  ...pluginVueA11y.configs['flat/recommended'],
+  {
+    name: 'app/vuejs-accessibility',
+    rules: {
+      'vuejs-accessibility/label-has-for': ['error', { required: { some: ['nesting', 'id'] } }],
+    },
+  },`,
+      },
```

The generated TypeScript config then reads:

```ts
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  ...pluginVueA11y.configs['flat/recommended'],
  {
    name: 'app/vuejs-accessibility',
    rules: {
      'vuejs-accessibility/label-has-for': ['error', { required: { some: ['nesting', 'id'] } }],
    },
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),
```

It sits before Oxlint's config, which create-vue adds after the rule configs because it only turns rules off.

### Alternatives

- **Opt-in.** A second question after ESLint, or an `--a11y` flag. This leaves the default config unchanged, but it reaches only people who already know to ask, which is the gap this proposal is about.
- **Wait for Oxlint.** Not possible today, since Oxlint does not read Vue templates.

If this direction is welcome, I'm happy to open the PR.
````

### Additional context

```markdown
- I found no earlier issue or PR here about accessibility linting. I searched for accessibility, a11y, vuejs-accessibility, jsx-a11y and aria; the only matches were Renovate PRs whose release notes mention accessibility.
- Everything above was checked on 27 October 2026, against create-vue 3.24.0 from npm and main at 6549e5e.
```

---

## Sources

All read or run on 27 October 2026.

1. npm downloads API, explicit ranges:
   - `https://api.npmjs.org/downloads/point/2026-09-28:2026-10-04/<package>`
     for the five packages in the table.
   - The literal last seven days, `2026-10-20:2026-10-26`, returned
     eslint-plugin-jsx-a11y 33,825,508, eslint-plugin-vuejs-accessibility
     328,193, eslint-plugin-vue 4,276,895, eslint-plugin-react 41,473,001
     and eslint-config-next 25,858,754. The per-day range endpoint shows
     zero for every package on 19, 20, 21 and 26 October, so that window
     holds only four days of data (22 to 25 October). Its ratios are close
     to the full week's: about 103 to 1 for jsx-a11y against
     vuejs-accessibility, 7.7 per 100 for Vue, 81.6 per 100 for React.
   - Other zero days since 1 September: 3, 7, 8 and 15 September, and 6,
     13, 14 and 15 October. 28 September to 4 October is the latest
     Monday-to-Sunday week with none.
   - The `last-week` shortcut returned 25 June to 1 July 2026, not the
     past week, so it is not usable today.
2. `npm view eslint-plugin-vuejs-accessibility`: latest 2.6.3, published
   21 October 2026. Peer `eslint` `^5.0.0 || ... || ^10.0.0`, peer
   `globals` `>= 13.12.1`, dependency `vue-eslint-parser`
   `^9.0.0 || ^10.0.0`. ESLint 10 first allowed in 2.4.2 (12 February
   2026), vue-eslint-parser 10 in 2.5.0 (13 February 2026). Release dates
   of 2.4.1 (23 July 2024), 2.6.0 (10 August 2026), 2.6.1 and 2.6.2
   (7 October 2026). Two npm maintainers.
3. [vue-a11y/eslint-plugin-vuejs-accessibility](https://github.com/vue-a11y/eslint-plugin-vuejs-accessibility):
   not archived, last push 21 October 2026, 26 open issues and pull
   requests. Issue
   [#1454](https://github.com/vue-a11y/eslint-plugin-vuejs-accessibility/issues/1454)
   (opened 8 February 2026, open), PR
   [#1453](https://github.com/vue-a11y/eslint-plugin-vuejs-accessibility/pull/1453)
   "feat: support ESLint v10" (merged 12 February 2026), issue
   [#54](https://github.com/vue-a11y/eslint-plugin-vuejs-accessibility/issues/54)
   (opened 27 August 2020, open), issue
   [#1359](https://github.com/vue-a11y/eslint-plugin-vuejs-accessibility/issues/1359)
   on vue-eslint-parser 10 (closed 13 February 2026).
4. The plugin's
   [Getting Started](https://vue-a11y.github.io/eslint-plugin-vuejs-accessibility/)
   page (`docs/index.md`) for the `flat/recommended` setup, and
   `docs/rules/label-has-for.md` for the `required` default
   `{ "every": ["nesting", "id"] }`.
5. eslint-plugin-jsx-a11y `docs/rules/label-has-for.md` on its default
   branch: "This rule was deprecated in v6.1.0", replaced by
   `label-has-associated-control`.
6. vuejs/create-vue main at
   [6549e5e](https://github.com/vuejs/create-vue/commit/6549e5ecaea41f52d489bde00f67ce6477de5481)
   (21 October 2026): `index.ts` (ESLint is one option in a multiselect
   with nothing preselected, and the `--oxlint` help says "Oxlint is now
   always included when ESLint is selected"), `template/linting/base`,
   `template/linting/core/{js,ts}`, `template/linting/oxlint`,
   `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/`. Discussions disabled
   (GitHub GraphQL `hasDiscussionsEnabled: false`). create-vue 3.24.0 is
   the latest release, 16 September 2026.
7. Scaffolds built with `create-vue@3.24.0` in a scratch folder, with
   `eslint-plugin-vuejs-accessibility@2.6.3` added, linted with ESLint
   10.13.0. Results as in the body, plus a check that a `<label>` with no
   control and an `<input>` with no label still fail under the override.
8. create-next-app on vercel/next.js main:
   `packages/create-next-app/index.ts` defaults `linter` to `eslint`, and
   `templates/index.ts` adds `eslint-config-next` when ESLint is chosen.
   `npm view eslint-config-next@16.4.3 dependencies` includes
   `eslint-plugin-jsx-a11y ^6.10.0`.
9. Oxlint docs, [Linter usage](https://oxc.rs/docs/guide/usage/linter.html):
   "Framework files (`.vue`, `.svelte`, `.astro`) by linting only their
   `<script>` blocks".
10. GitHub search of vuejs/create-vue issues and pull requests for
    `accessibility`, `a11y`, `vuejs-accessibility`,
    `eslint-plugin-vuejs-accessibility`, `jsx-a11y` and `aria`.

## What I could not confirm

- That downloads track projects. They also count CI runs, mirrors and
  transitive installs. The body says so.
- Why jsx-a11y deprecated its `label-has-for`. I cite only the
  deprecation and its replacement.
- That the sketch passes create-vue's own CI. I tested the generated
  output, not a build of create-vue from a branch. create-vue's
  `scripts/test.mjs` builds, type-checks and tests the playground
  projects but does not lint them, so lint coverage would need adding or
  a manual check.
- pnpm and Yarn installs. I used npm, which installed the plugin's
  `globals` peer by itself. I did not test the other two.
