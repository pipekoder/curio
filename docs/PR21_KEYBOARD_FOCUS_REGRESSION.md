# PR #21: first-keyboard-focus regression

## Root cause and evidence

CI run `40692184816` at `8913d03` passed all application checks and 30 browser tests; the 390px first-Tab assertion failed. The old test sent `page.keyboard.press('Tab')` immediately after `page.goto('/')`. Keyboard input does not auto-wait for React controls as locator actions do.

`createRoot(...).render(...)` schedules the first commit asynchronously. The document load event may complete before that commit. Instrumented local reproduction captured this exact ordering:

1. `document.readyState` was `complete`.
2. The Tab `keydown` target/active element was `BODY` and `.skip-link` was absent.
3. React subsequently inserted the link, but focus remained on `BODY`; waiting on `toBeFocused()` could not replay the already-sent Tab.

Without an extra diagnostic round trip before Tab, this occurred on 1/10 normal-speed and 9/10 six-times CPU-throttled mobile navigations. An earlier diagnostic evaluation before Tab accidentally masked the race, reinforcing why incidental delays are not a fix.

Application review found the skip link first in DOM tab order, no positive tabindex/autofocus, and no startup focus-stealing handler. The dialog focus effect requires an open panel and the edition focus effect requires a generated edition; both are inactive on initial load. Ctrl/Meta+Enter handling only applies inside the prompt. Once mounted, native Tab focuses the link and native Enter focuses the target textarea. No application accessibility defect was found after the reader is available.

CI used Playwright Chromium 156.0.8078.4; this workspace uses system Chromium 154.0.8037.57. Timing/scheduling differences expose the race, but reproduction on the existing local browser shows it is not exclusive to one browser version. The managed network policy blocked downloading Chromium 156 locally; the GitHub CI run on the patched commit is the verification on that engine. No browser pinning, retries, test timeout increases or network-policy workaround is used.

## Correction

The acceptance check waits for the skip link to be attached and the labeled prompt to be editable, then **asserts that focus is still on BODY**. It does not move/reset focus. It then sends one real Tab and requires the skip link to be focused and in the viewport. A real Enter must then focus the prompt textarea. This strengthens keyboard coverage rather than replacing it with `.focus()`.

Two deterministic regressions gate the application bundle at desktop/mobile widths. They begin the keyboard check while `#root` is empty, release the bundle, and require the same first-Tab/Enter behavior. No fixed sleep or retry is involved. These regressions detect sending Tab before application readiness.

This correction changes only tests and readiness documentation on PR #21. Runtime application code, production flags, model calls, independent PR #19/#20 branches and deployment configuration are untouched.

## Verification

Commands:

```bash
CI=true CHROMIUM_PATH=/usr/bin/chromium npm run test:browser -- tests/visual-acceptance.spec.ts --repeat-each=10 --workers=1
CI=true CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
npm run typecheck
npm run lint
```

Local results: **40/40 focused checks passed** (four scenarios repeated ten times), **33/33 full Chromium checks passed**, and typecheck/lint passed. Temporarily removing the readiness waits caused both controlled delayed-start regressions to fail as expected; the restored correction passed. The PR and final report record the GitHub CI run for the correction. Browser tests use approved original illustrations and disabled/mocked inference; no paid model request is made.
