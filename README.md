# agentshot

Website screenshots for AI coding agents, taken on your own machine.

`agentshot` opens a page in a local Chrome/Chromium through Playwright and writes a PNG or JPEG to disk, so an agent such as Claude Code, Codex, Cursor, Windsurf or OpenCode can look at what it built. It works on localhost, preview, staging and live URLs.

It is free and open source under the MIT license. There is no account, no license key and no usage limit, and the CLI makes no network calls of its own. You need the internet only to install it, and to capture pages that are themselves on the internet.

## Install

You need Node.js 20 or newer on macOS, Linux or Windows/WSL.

```bash
npm install -g agentscreenshots
```

This installs the `agentshot` command. During install it looks for Chrome or Chromium on your machine and uses it if it finds one. If it finds none, it downloads Playwright Chromium, and that download is the only thing it fetches. To skip that step:

```bash
AGENTSHOT_SKIP_BROWSER_INSTALL=1 npm install -g agentscreenshots
agentshot install-browser   # later, if no system browser is found
```

To use a specific browser, set `AGENTSHOT_BROWSER_PATH` to its executable.

## Update

```bash
npm install -g agentscreenshots@latest
```

## Usage

```bash
# Full page
agentshot "http://127.0.0.1:5173" ".agents/screenshots/home.png"

# Lazy-loaded page
agentshot "http://127.0.0.1:5173" ".agents/screenshots/home.png" --scroll --wait 1000

# Quick capture in the OS temp folder
agentshot "http://127.0.0.1:5173" "home.png" --temp

# One section, a vertical slice, a mobile viewport
agentshot "http://127.0.0.1:5173" "pricing.png" --selector "section:has-text('Pricing')" --padding 24
agentshot "http://127.0.0.1:5173" "slice.png" --from 1600 --to 2400
agentshot "http://127.0.0.1:5173" "mobile.png" --viewport 390x844 --scroll --wait 1000

# Dismiss a cookie banner, or show a hover state, before the capture
agentshot "https://example.com" "home.png" --click-if-present "button:has-text('Reject all')" --wait 500
agentshot "http://127.0.0.1:5173" "menu.png" --hover ".nav-item" --selector ".nav-region" --padding 24
```

Selectors are Playwright locators, so plain CSS, `text=Pricing`, `section:has-text('Pricing')` and `xpath=...` all work. Screenshots default to `--device-scale-factor 2`; use `1` for smaller files, or when a model rejects an image as too large. On live sites prefer `--wait-until load --wait 1500` to `networkidle`, which analytics and chat widgets can keep from settling.

`agentshot --help` lists every option. The other commands:

```text
agentshot status            version, Node, and which browser will be used
agentshot doctor            checks that a local browser launches and output can be written
agentshot install-browser   downloads Playwright Chromium (--force to download it anyway)
agentshot instructions      prints the agent instructions
agentshot feedback          where to report bugs and ideas
```

`--json` gives machine-readable output on captures, `status` and `doctor`.

## Agent instructions

`agentshot instructions` prints a short guide for coding agents: when to capture, where to save screenshots (`.agents/screenshots/` by default), which capture fits which question, and how to troubleshoot. Paste it into your agent's instructions file, such as `AGENTS.md`, or tell the agent to run `agentshot instructions` before its first capture. The same text is in [AGENT-INSTRUCTIONS.md](./AGENT-INSTRUCTIONS.md).

## Upgrading from 0.2

Version 0.3 removed licensing, usage reporting and the sign-in commands. The old flags `--no-report`, `--api-url` and `--license-key` are still accepted and ignored, so saved commands keep working. The first run deletes the old usage queue at `~/.config/agentshot/usage-queue.jsonl`. You can delete `~/.config/agentshot/config.json` too, since nothing reads it any more.

## Playground

The package ships a few offline test pages (modal, accordion, hover states, cookie banner, a tall page) under `playground/`:

```bash
PLAYGROUND_DIR="$(npm root -g)/agentscreenshots/playground"
python3 -m http.server 5197 --bind 127.0.0.1 --directory "$PLAYGROUND_DIR"
agentshot "http://127.0.0.1:5197/" ".agents/screenshots/playground.png" --scroll
```

## Development

```bash
npm install
npm run check
npm run build
npm link
agentshot --version
```

Bugs and ideas: https://github.com/ArchMiha/agentshot/issues

## License

MIT. See [LICENSE](./LICENSE).
