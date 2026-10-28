# Chromium bug: `::scroll-marker` takes focus behind a modal dialog

Draft for Thomas to file at https://issues.chromium.org/issues/new,
component Blink>CSS. Not filed. Measured on 28 October 2026 with Playwright
1.64.1 (Chromium 156.0.8078.4, headless shell and channel `chromium`) on
macOS. Two independent runs, with different fixtures, agree on everything
below.

## Before you file

1. Open the repro in a real Chrome window and press Tab yourself. In a real
   window, Tab past the last control goes to the browser toolbar, which the
   headless runs could not show. The `focusin` line in step 2 makes the
   brief focus visible in the console.
2. Search the tracker again for `scroll-marker inert`, `scroll-marker
   dialog` and `scroll-marker focus`. On 28 October nothing matched.
3. Attach the repro below as `repro.html`.

---

## Title

```
::scroll-marker takes keyboard focus behind a modal <dialog>, and after inert is set, until it is restyled
```

## Steps to reproduce

1. Open `repro.html`. It has a modal `<dialog>` with one button and, after
   it in the page, a CSS carousel with three `::scroll-marker`s and two
   `::scroll-button()`s. Its only script opens the dialog.
2. In the DevTools console, run
   `addEventListener("focusin", e => console.log(e.target, document.activeElement), true)`.
3. Activate "Open the dialog". Focus moves to "Close" inside the dialog.
4. Press Tab four times, then keep pressing Tab.

## Expected

While the dialog is open, everything outside it is inert, and inert content
cannot take focus. Tab from "Close" should reach only the browser UI and
then "Close" again, and no `focus` or `focusin` event should fire outside
the dialog. Chromium already does this for the `::scroll-button()`s and for
the scroll container itself.

## Actual

- The first three Tab presses each give one `::scroll-marker` focus, for
  slides 1, 2 and 3 in order. `focus` and `focusin` fire on the inert slide
  elements, the markers' originating elements. Inside those listeners,
  `document.activeElement` is the inert scroll container, `#carousel` matches
  `:focus-within`, and `document.hasFocus()` is true.
- Chromium then fires `blur` and `focusout`, and `document.activeElement`
  becomes `<body>`. That took 0.3 to 1.5 ms when the page was idle, and until
  the next frame (4 to 15 ms) when the page was already producing frames. So
  a `requestAnimationFrame` probe may miss the focus, while a `focusin`
  listener always sees it. Nothing visible is focused, so to the user three
  Tab presses do nothing.
- The fourth press returns focus to "Close". After this first lap the
  markers are skipped. Shift+Tab does the same in reverse on the first lap.
- It happens again on every opening: open, Escape, reopen, three times, and
  each time the first three Tab presses reach the three markers.
- If the Enter or Space keydown arrives before Chromium drops focus, it
  activates the inert marker and scrolls the inert carousel while the dialog
  stays open. With the repro as attached and the page idle, Playwright's
  back-to-back "Tab Tab Enter" scrolled the carousel from slide 1 to slide 2
  (`scrollLeft` 0 to 320) in 4 of 4 runs. A single Tab then Enter lands on
  the marker for slide 1, which is already current, so nothing moves. With
  the carousel scrolled to slide 3 first and a `requestAnimationFrame` loop
  running, a single Tab then Enter scrolled it back to slide 1 (640 to 0) in
  4 of 4 runs.

When it happens:

- The markers' style must have been computed before the content becomes
  inert. A `showModal()` from an inline script during parsing does not
  reproduce, unless that script first forces style, for example with
  `getComputedStyle(carousel).width`.
- No dialog is needed. Setting `inert` on an ancestor, or `interactivity:
  inert`, after render has the same effect. With either present from page
  load, the markers are never reached.
- Only `::scroll-marker` is affected. The `::scroll-button()`s and the
  scroll container were never reached behind the dialog in any variant.

A live example: on https://accessible-by-default.dev/showcase.html, with
"Open the dialog" open, the first lap of Tab stops one to five times on the
page's carousel markers.

A possible cause, not checked against the code: commit 283387d ("Don't allow
interactivity to escape inertness", crbug 370065759) made `::scroll-marker`
take its inertness from its `::scroll-marker-group`. When inertness arrives
later, the markers' computed inertness seems not to update until something
restyles them, and focusing a marker does restyle it, which would explain
why the next lap skips it.

## Versions

- Chromium 156.0.8078.4 as bundled with Playwright 1.64.1, macOS. Nothing
  older was tested, so whether this is a regression is unknown.
- `::scroll-button()` and `::scroll-marker` shipped in Chrome 135 (stable 1
  April 2025; chromestatus 5093129273999360 and 5160035463462912).
- Firefox 157 and WebKit 27.2 do not support these pseudo-elements
  (`CSS.supports("selector(::scroll-marker)")` is false), and nothing
  behind their dialog takes focus.

## Spec references (read 28 October 2026)

- HTML,
  [Modal dialogs and inert subtrees](https://html.spec.whatwg.org/multipage/interaction.html#modal-dialogs-and-inert-subtrees):
  while the document is blocked by a modal dialog, every connected node
  except the dialog and its flat tree descendants "must become inert".
- HTML, [focusing steps](https://html.spec.whatwg.org/multipage/interaction.html#focusing-steps):
  if the new focus target's DOM anchor is inert, return.
- CSS Overflow 5,
  [the active element](https://drafts.csswg.org/css-overflow-5/#active-element):
  a focused `::scroll-marker` reports its scroll container as the active
  element, and here that container is inert.
- The CSSWG resolved that the interactivity of `::scroll-marker` follows its
  `::scroll-marker-group`
  ([w3c/csswg-drafts#11746](https://github.com/w3c/csswg-drafts/issues/11746#issuecomment-2773041391),
  2 April 2025).

## Related

- crbug 370065759 (Fixed) and its commit 283387d, which added WPT
  `scroll-marker-inert-001.html` and `-002.html`. These, and `-003.html`,
  test pointer activation with inertness present from load.
- crbug 522843224 (Fixed): `::scroll-marker` with `display: contents` not
  inert, set from load, with clicks.
- No test was found for keyboard focus on `::scroll-marker` under a modal
  dialog or after `inert` is added.

## Repro

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scroll markers focusable behind a modal dialog</title>
<style>
  body { font: 16px/1.4 system-ui, sans-serif; margin: 2rem; }
  .carousel {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 100%;
    inline-size: 20rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-marker-group: after;
  }
  .carousel > div { scroll-snap-align: start; block-size: 5rem; background: #ddd; }
  .carousel::scroll-button(inline-start) { content: "<" / "Previous slide"; }
  .carousel::scroll-button(inline-end) { content: ">" / "Next slide"; }
  .carousel::scroll-marker-group { display: flex; gap: .5rem; padding-block: .5rem; }
  .carousel > div::scroll-marker { content: "" / "Slide"; inline-size: 1rem; block-size: 1rem; border: 1px solid; border-radius: 50%; }
  .carousel > div::scroll-marker:target-current { background: currentColor; }
  :focus-visible, ::scroll-button(*):focus-visible, ::scroll-marker:focus-visible { outline: 4px solid magenta; outline-offset: 2px; }
</style>
</head>
<body>
<h1>Scroll markers behind a modal dialog</h1>
<p>Open the dialog, then press Tab. While the dialog is open, everything outside it is inert, so nothing below the dialog should take focus.</p>
<button id="open" type="button">Open the dialog</button>
<dialog id="dialog">
  <p>Everything outside this dialog is inert.</p>
  <form method="dialog"><button id="close">Close</button></form>
</dialog>
<div class="carousel" id="carousel">
  <div>Slide 1</div>
  <div>Slide 2</div>
  <div>Slide 3</div>
</div>
<script>document.getElementById("open").addEventListener("click", () => document.getElementById("dialog").showModal());</script>
</body>
</html>
```
