# agentshot agent instructions

Use `agentshot` for rendered webpage screenshots and visual UI checks. It is free, runs entirely on this machine with a local browser, and needs no account, license key, or network access of its own.

What this tool is good for:
- Inspecting a page, component, section, or responsive viewport after frontend edits.
- Verifying layout, spacing, overflow, wrapping, missing assets, and visual regressions.
- Capturing localhost, preview, staging, or production pages.
- Giving an AI coding agent a PNG artifact it can inspect before judging the UI.

Default workflow:
1. Identify the exact URL to inspect. For local dev, use the active localhost URL such as `http://127.0.0.1:5173`.
2. Save screenshots into a predictable project folder, preferably `.agents/screenshots/`.
3. Prefer selector, viewport, or vertical-slice captures over huge full-page screenshots when they answer the question.
4. Inspect the saved PNG with image-reading/viewing capability before making visual claims.
5. If the UI is wrong, make a focused fix, capture again, and inspect again.

Best practices:
- When editing an existing UI element, capture the relevant area before the change and again after the change. Compare the two screenshots before concluding that the edit worked, and check nearby layout so the fix did not introduce a visual regression.
- Use a stable output folder and descriptive filenames so before/after pairs are easy to review, for example `button-before.png` and `button-after.png`.
- For responsive work, capture the smallest likely mobile width and the normal desktop width before calling the work complete.
- For stateful UI, use `--click`, `--click-if-present`, `--hover`, or `--hover-if-present` to put the page into the state the user will actually see.

Core commands:

```bash
agentshot "<url>" ".agents/screenshots/page.png" --scroll --wait 1000
agentshot "<url>" ".agents/screenshots/top.png" --height 1200 --wait 500
agentshot "<url>" ".agents/screenshots/slice.png" --from 1600 --to 2400 --wait 500
agentshot "<url>" ".agents/screenshots/section.png" --selector "section:has-text('Pricing')" --padding 24 --wait 500
agentshot "<url>" ".agents/screenshots/card-2.png" --selector ".pricing-card" --nth 1 --padding 16 --wait 500
agentshot "<url>" ".agents/screenshots/mobile.png" --viewport 390x844 --scroll --wait 1000
agentshot "<url>" ".agents/screenshots/desktop.png" --viewport 1440x1000 --scroll --wait 1000
agentshot "https://example.com" ".agents/screenshots/live-page.png" --scroll --wait 2500 --wait-until load
agentshot "<url>" "pricing-section.png" --temp --selector "section:has-text('Pricing')" --padding 24 --wait 500
agentshot "https://example.com" ".agents/screenshots/no-cookie-banner.png" --click-if-present "button:has-text('Reject all')" --wait 500
agentshot "<url>" ".agents/screenshots/hover-menu.png" --hover ".nav-item" --selector ".nav-region" --padding 24 --wait 500
agentshot "<url>" ".agents/screenshots/small.png" --viewport 1440x1000 --device-scale-factor 1 --wait 500
```

Capture options:
- `--selector SELECTOR`: capture the first matching Playwright/CSS selector.
- `--section SELECTOR`: alias for `--selector`.
- `--nth INDEX`: choose another selector match, zero-based.
- `--padding PX`: add padding around selector captures.
- `--height PX`: capture from page top or `--from` to a fixed height.
- `--from PX --to PX`: capture a vertical page slice.
- `--viewport WIDTHxHEIGHT`: set viewport size.
- `--device-scale-factor N`: capture higher-density pixels without changing CSS layout. Defaults to `2`; use `1` when smaller files matter more than visual fidelity.
- `--scroll`: scroll first to trigger lazy-loaded or scroll-triggered content.
- `--wait MS`: wait after navigation/scroll before capture.
- `--wait-for CSS`: wait until a specific element exists before capture.
- `--click SELECTOR`: click a required Playwright/CSS selector before capture. It searches the main page and child frames. Repeat the flag for multiple clicks.
- `--click-if-present SELECTOR`: try to click a Playwright/CSS selector before capture, but continue if it is missing. It searches the main page and child frames. Repeat the flag for multiple possible overlays.
- `--hover SELECTOR`: hover a required Playwright/CSS selector before capture. It searches the main page and child frames. Repeat the flag for multiple hovers.
- `--hover-if-present SELECTOR`: try to hover a Playwright/CSS selector before capture, but continue if it is missing. It searches the main page and child frames. Repeat the flag for multiple optional hover targets.
- `--wait-until load|domcontentloaded|networkidle`: choose load-state wait.
- `--temp`: save in the OS temp directory. With a filename hint, for example `pricing.png --temp`, the output is named like `pricing-temp-df2d.png`; without a filename hint, the name is derived from the URL. It does not add timed deletion or cleanup tracking.
- `--json`: print machine-readable capture metadata.

Output path best practices:
- For project captures, pass an explicit output path so the capture lands exactly where the user or agent expects.
- For project work, save screenshots inside the active repo, preferably under `.agents/screenshots/`.
- Use task-specific subfolders for larger runs, such as `.agents/screenshots/qc/`, `.agents/screenshots/mobile/`, or `.agents/screenshots/2026-05-17-pricing/`.
- Use descriptive filenames that include the page, viewport, section, or state, for example `pricing-mobile.png`, `hero-hover-menu.png`, or `checkout-modal-closed.png`.
- Add `.agents/screenshots/` to `.gitignore` unless the screenshots are intentionally part of the repo.
- For fast development captures that do not need versioned screenshot history, use `--temp` when available.
- If the user provides a specific output path or saving instructions, use that path and those instructions exactly.

Selector notes:
- Plain CSS selectors work: `.hero`, `#pricing`, `[data-testid='nav']`.
- Playwright text selectors work: `text=Pricing`.
- Playwright text filters work: `section:has-text('Pricing')`.
- XPath works when needed: `xpath=//section[.//h2[contains(., 'Pricing')]]`.

Live-site notes:
- For production websites, prefer `--wait-until load --wait 1500` to `--wait-until networkidle` unless you know the page settles cleanly.
- `networkidle` can time out on live sites with analytics, chat widgets, streaming requests, or long-running background fetches.
- Use `--scroll --wait 1500` or longer when external images, lazy sections, or scroll-triggered animations need time to render.
- Use `--click-if-present "button:has-text('Reject all')"`, `--click-if-present "button[aria-label='Close']"`, or a site-specific selector to dismiss cookie banners and fixed overlays before capture. Prefer reject/close actions when available.
- Use `--click` or `--click-if-present` to open or close click-driven UI such as modals, drawers, accordions, details sections, tabs, dropdown menus, and collapsed content.
- Use `--hover` or `--hover-if-present` for hover-driven UI such as tooltips, hover cards, menu flyouts, hover-revealed controls, and CSS `:hover` states.
- Many live sites do not use semantic `<section>` tags. If selector capture is unreliable, use stable IDs, text selectors, or measured vertical slices with `--from` and `--to`.

When to use full-page capture:
- Use it for broad page reviews and final sanity checks.
- Pair it with `--scroll --wait 1000` when images, animations, or lazy content may not render until scrolled.
- Avoid repeated full-page screenshots when a section or slice would answer the visual question faster.

When to use selector capture:
- Use it after editing a specific component or section.
- Use `--padding` so borders, shadows, focus rings, and nearby spacing are visible.
- Use `--nth` when multiple elements match the selector.

When to use mobile/desktop viewports:
- Use mobile checks for nav, wrapping, overflow, CTA layout, form layout, and horizontal scrolling.
- Use desktop checks when max-widths, columns, hero composition, or large-screen spacing matter.
- Screenshots default to `--device-scale-factor 2` for sharper image understanding. Use `--device-scale-factor 1` for large batch or matrix runs, such as dozens or hundreds of screenshots, when reducing disk/CI artifact size or upload time matters more than visual fidelity.
- Use `--viewport` to test different responsive widths. Browser/page zoom is not a first-class `agentshot` option; viewport changes are the supported way to inspect narrower or wider layouts.

Troubleshooting:
- If capture fails, run `agentshot doctor`.
- If browser setup is missing, run `agentshot install-browser` only when setup changes are acceptable.
- If a selector is missing, verify the URL and selector, then try `--wait-for "<selector>"`.
- If content is blank or incomplete, try `--scroll`, `--wait 1500`, or `--wait-for "<selector>"`. Use `--wait-until networkidle` only when the target page is expected to become idle.
- If your model or conversation API rejects, removes, or fails to read a screenshot because the image is too large, capture a smaller PNG. `agentshot` defaults to retina-sharp `--device-scale-factor 2` so models can see details more clearly and reason more accurately, but that doubles output dimensions: a 1440px-wide viewport becomes a 2880px-wide image. Some APIs reject large images, especially when multiple screenshots are uploaded together. Retry with `--device-scale-factor 1`, a narrower `--width` or `--viewport`, a shorter `--height`, or a vertical slice with `--from` / `--to`; if needed, inspect one screenshot at a time.

Do not:
- Do not rely only on command success; inspect the PNG.
- Do not paste base64 screenshots into chat.
- Do not use full-page screenshots as the default for every small UI question.
- Do not keep re-capturing without a concrete hypothesis or a code change.
- Do not install, update, or reinstall `agentshot` or its browser unless the user explicitly asks.

Fallback:
- Use a browser automation tool such as `agent-browser` or Playwright instead when the task requires complex clicking, filling forms, login/session state, console/network inspection, annotated element refs, or multi-step browser exploration. Use `agentshot --click-if-present` for simple one-click overlay dismissal before a screenshot.
