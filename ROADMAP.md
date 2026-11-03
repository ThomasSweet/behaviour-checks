# Roadmap

Reliability comes before new checks: a check that fails a correct widget costs
more trust than a missing check earns. Thomas sets the order and decides each
release.

## Where it stands

A field test on 1 November 2026 ran 0.3.0 over 51 public pages on 23 sites, in
Chromium with reduced motion, and walked 15 dialogs. Of 34 findings, 13 were
real (3 distinct defects), 12 were false (35%, or 41% with default options) and
9 were out of scope. axe reported none of the 34.

Read those numbers as a direction, not a rate. The sample leans to polished
design systems, 10 of the 13 real findings are static docs demos, and no
hand-built production modal was tested. The modal walk was also measured
separately on 13 older demos, where 4 had real focus faults and the package
caught 2.

The state comparison and the modal walk produced the false results. The error
check produced none, but it presses nothing.

Done since: 0.4.1 skips toggles that are not rendered, and 0.5.0 waits for
widgets that react late, the two largest causes.

## Now: stop false results

Unless marked, each item was reproduced on the published 0.4.0 with a minimal
page, in Chromium, Firefox and WebKit, on 1 November 2026.

1. **Dialog detection.**
   - A working modal whose `role="dialog"` root has no size gets
     `modal-walk/no-dialog-opens`.
   - An open tooltip popover can be taken for the dialog, which gives false
     failures on a correct modal.
   - A modal with no dialog role is reported as "opened nothing", which is
     false. Add a `dialog` option to point at one, and reword the finding to
     say nothing the check recognises opened.
2. **One Escape only.** When the first Escape dismisses a tooltip and the
   second closes the modal, the walk stops at its warning and never reaches
   focus return, so a real fault can be missed.
3. **Restore.** A menu that closes only on Escape from inside it stays open
   after the sweep: the second press moves focus to the opener, so restore's
   Escape misses the menu. On a page of 3 menus, all 3 stayed open and no
   finding said so. Later widgets are then tested behind them.
4. **`not-a-tab-stop` wording.** It says "the keyboard cannot reach it" and
   cites 2.1.1 even when arrow keys do reach it, in a header with no role that
   announces this. Say what was measured.
5. **Smaller.**
   - A truthful partial collapse, such as a code block going from 150px to
     500px, reports a contradiction.
   - `walkModal` waits with no limit on a locator that matches nothing.
   - The default error selector finds no `.invalid-feedback` message. The
     `errors` option does. Decide whether to widen the default or document it.
   - Not reproduced here, seen on real pages only: one warning changed between
     runs with its cause unknown, and a keyboard-clean modal plugin got a false
     failure.

## Next

- **Tabs.** `aria-selected` has the same shape as the expanded-state check, and
  tabs are the other half of the survey item. Only after the list above.
- **Older Playwright versions.** A project on 1.56 stops with `ERESOLVE`. Add
  older versions to the install matrix, and if they work, lower the 1.64 floor.
- **CLI and agent skill.** A later minor, as `docs/scope.md` decided.

## Before any announcement

- Under 10% false failures on 30 hand-built production modals.
- One outside team's CI catching a regression.

## Not doing

- **Live announcements.** A browser test cannot hear them.
- **"Meaningful" focus order.** A test cannot judge meaning.
- **Cypress and listbox.** Rejected on the field evidence.
- **Pressing role-less elements, or a scripted click.** Tried for 0.3.0: review
  reproduced 54 defects, such as followed links and ticked checkboxes.
- **Counting an error as next to the field before it.** Rejected for 0.4.0: a
  form-level message before the submit button would fail the last field.
