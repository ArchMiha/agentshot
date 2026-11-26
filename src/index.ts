#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { basename, dirname, extname, join } from 'node:path';
import { ensureBrowserInstalled } from './browser.js';
import { capture } from './capture.js';
import { runDoctor } from './doctor.js';
import { removeLegacyUsageQueue } from './legacy.js';
import { formatStatus, getStatus } from './status.js';
import type { CaptureOptions } from './types.js';

const ISSUES_URL = 'https://github.com/ArchMiha/agentshot/issues';

type ParsedCommand =
	| { name: 'capture'; options: CaptureOptions }
	| { name: 'auth'; json: boolean }
	| { name: 'logout'; json: boolean }
	| { name: 'status'; json: boolean }
	| { name: 'doctor'; json: boolean }
	| { name: 'feedback'; json: boolean }
	| { name: 'install-browser'; force: boolean; json: boolean }
	| { name: 'instructions' }
	| { name: 'help' }
	| { name: 'version' };

function printHelp() {
	console.log(`agentshot: local website screenshots for AI coding agents

Usage:
  agentshot URL OUTPUT [options]
  agentshot URL --temp [options]
  agentshot URL NAME --temp [options]
  agentshot status [--json]
  agentshot doctor [--json]
  agentshot install-browser [--force] [--json]
  agentshot instructions
  agentshot feedback
  agentshot --version

Examples:
  agentshot "http://127.0.0.1:5200/design" "./shots/design.png"
  agentshot "http://127.0.0.1:5200/design" --temp
  agentshot "http://127.0.0.1:5200/design" "hero.png" --temp
  agentshot "http://127.0.0.1:5200/design" "./shots/hero.png" --height 1200
  agentshot "http://127.0.0.1:5200/design" "./shots/cards.png" --from 1800 --to 2500
  agentshot "http://127.0.0.1:5200/design" "./shots/borders.png" --selector "section:has-text('Borders')" --padding 24
  agentshot "http://127.0.0.1:5200/design" "./shots/page.png" --scroll --wait 1000

Capture options:
  --wait MS                 Wait after load/scroll before capture
  --scroll                  Scroll through the page first to trigger lazy-loaded content
  --selector SELECTOR       Capture the first matching Playwright/CSS selector
  --section SELECTOR        Alias for --selector
  --nth INDEX               Capture selector match by zero-based index (default: 0)
  --padding PX              Add padding around selector screenshots (default: 0)
  --height PX               Capture from --from/top to this height; defaults from 0
  --from PX                 Vertical crop start, page pixels
  --to PX                   Vertical crop end, page pixels
  --width PX                Browser viewport width (default: 1280)
  --viewport-height PX      Browser viewport height (default: 900)
  --viewport WIDTHxHEIGHT   Set viewport width and height together
  --wait-for CSS            Wait for a selector before capture
  --click SELECTOR          Click a required selector before capture; repeatable
  --click-if-present SELECTOR
                            Try to click a selector before capture; repeatable
  --hover SELECTOR          Hover a required selector before capture; repeatable
  --hover-if-present SELECTOR
                            Try to hover a selector before capture; repeatable
  --wait-until STATE        load, domcontentloaded, or networkidle (default: load)
  --timeout MS              Navigation/action timeout (default: 30000)
  --browser NAME            chromium auto-detects local Chrome/Chromium, or use chrome channel
  --headed                  Show the browser window
  --no-full-page            Capture only viewport when no selector/crop is used
  --device-scale-factor N   Device scale factor (default: 2)
  --temp                    Save to OS temp dir; optional OUTPUT becomes filename hint
  --json                    Print machine-readable JSON

Environment:
  AGENTSHOT_BROWSER_PATH            Use this Chrome/Chromium executable
  AGENTSHOT_SKIP_BROWSER_INSTALL=1  Skip the browser download during npm install

agentshot is free and open source (MIT). It needs no account or license key
and makes no network calls of its own. Bugs and ideas: ${ISSUES_URL}
`);
}

function parsePositiveNumber(value: string, name: string) {
	const parsed = Number(value);

	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive number.`);
	}

	return parsed;
}

function parseInteger(value: string, name: string) {
	const parsed = Number.parseInt(value, 10);

	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${name} must be a positive integer.`);
	}

	return parsed;
}

function readValue(args: string[], index: number, option: string) {
	const value = args[index + 1];

	if (!value || value.startsWith('--')) {
		throw new Error(`${option} requires a value.`);
	}

	return value;
}

function getDefaultCaptureOptions(url: string, output: string): CaptureOptions {
	return {
		url,
		output,
		temporary: false,
		width: 1280,
		viewportHeight: 900,
		deviceScaleFactor: 2,
		waitMs: 0,
		timeoutMs: 30_000,
		scroll: false,
		actions: [],
		selector: null,
		selectorIndex: 0,
		padding: 0,
		fromY: null,
		toY: null,
		clipHeight: null,
		fullPage: true,
		waitForSelector: null,
		waitForLoadState: 'load',
		browser: 'chromium',
		headed: false,
		json: false
	};
}

function slugifyFilename(value: string) {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 64) || 'capture'
	);
}

function getTempCaptureOutput(url: string, nameHint: string | null = null) {
	const id = randomUUID().replace(/-/g, '').slice(0, 4);

	if (nameHint) {
		const name = basename(nameHint);
		const extension = extname(name).toLowerCase();
		const outputExtension = extension === '.jpg' || extension === '.jpeg' ? extension : '.png';
		const stem = extension ? name.slice(0, -extension.length) : name;

		return join(tmpdir(), 'agentshot', `${slugifyFilename(stem)}-temp-${id}${outputExtension}`);
	}

	let source = 'capture';

	try {
		const parsed = new URL(url);
		if (parsed.protocol === 'data:') {
			source = 'data-url';
		} else {
			const host = parsed.hostname || parsed.protocol.replace(':', '') || 'capture';
			const path = parsed.pathname === '/' ? '' : parsed.pathname;
			source = `${host}${path}`;
		}
	} catch {
		source = url;
	}

	const slug = slugifyFilename(source);

	return join(tmpdir(), 'agentshot', `${slug}-temp-${id}.png`);
}

// --api-url and --license-key belonged to the hosted service in 0.2 and earlier.
// They are still accepted, with their value, so saved commands keep working.
const LEGACY_VALUE_OPTIONS = new Set(['--api-url', '--license-key']);

function parseJsonOnlyOptions(args: string[]) {
	let json = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--json') {
			json = true;
		} else if (LEGACY_VALUE_OPTIONS.has(arg)) {
			readValue(args, index, arg);
			index += 1;
		} else {
			throw new Error(`Unknown option: ${arg}`);
		}
	}

	return { json };
}

function parseInstallBrowser(args: string[]): ParsedCommand {
	let force = false;
	let json = false;

	for (const arg of args) {
		if (arg === '--force') {
			force = true;
		} else if (arg === '--json') {
			json = true;
		} else {
			throw new Error(`Unknown option: ${arg}`);
		}
	}

	return { name: 'install-browser', force, json };
}

function parseCapture(args: string[]): ParsedCommand {
	if (args.length < 1) {
		throw new Error('Capture requires URL and OUTPUT, or URL with --temp.');
	}

	const [url, maybeOutput, ...maybeRest] = args;
	const output = maybeOutput && !maybeOutput.startsWith('--') ? maybeOutput : null;
	const rest = output ? maybeRest : args.slice(1);
	const temporary = rest.includes('--temp');

	if (!output && !temporary) {
		throw new Error('Capture requires OUTPUT unless --temp is used.');
	}

	const options = getDefaultCaptureOptions(url, temporary ? getTempCaptureOutput(url, output) : output!);
	options.temporary = temporary;

	for (let index = 0; index < rest.length; index += 1) {
		const arg = rest[index];

		switch (arg) {
			case '--wait':
				options.waitMs = parseInteger(readValue(rest, index, arg), arg);
				index += 1;
				break;
			case '--scroll':
				options.scroll = true;
				break;
			case '--selector':
			case '--section':
				options.selector = readValue(rest, index, arg);
				index += 1;
				break;
			case '--nth':
				options.selectorIndex = parseInteger(readValue(rest, index, arg), arg);
				index += 1;
				break;
			case '--padding':
				options.padding = parseInteger(readValue(rest, index, arg), arg);
				index += 1;
				break;
			case '--height':
				options.clipHeight = parseInteger(readValue(rest, index, arg), arg);
				index += 1;
				break;
			case '--from':
				options.fromY = parseInteger(readValue(rest, index, arg), arg);
				index += 1;
				break;
			case '--to':
				options.toY = parseInteger(readValue(rest, index, arg), arg);
				index += 1;
				break;
			case '--width':
				options.width = parseInteger(readValue(rest, index, arg), arg);
				index += 1;
				break;
			case '--viewport-height':
				options.viewportHeight = parseInteger(readValue(rest, index, arg), arg);
				index += 1;
				break;
			case '--viewport': {
				const value = readValue(rest, index, arg);
				const match = value.match(/^(\d+)x(\d+)$/i);

				if (!match) {
					throw new Error('--viewport must look like 1280x900.');
				}

				options.width = parseInteger(match[1], '--viewport width');
				options.viewportHeight = parseInteger(match[2], '--viewport height');
				index += 1;
				break;
			}
			case '--wait-for':
				options.waitForSelector = readValue(rest, index, arg);
				index += 1;
				break;
			case '--click':
				options.actions.push({
					type: 'click',
					selector: readValue(rest, index, arg),
					optional: false
				});
				index += 1;
				break;
			case '--click-if-present':
				options.actions.push({
					type: 'click',
					selector: readValue(rest, index, arg),
					optional: true
				});
				index += 1;
				break;
			case '--hover':
				options.actions.push({
					type: 'hover',
					selector: readValue(rest, index, arg),
					optional: false
				});
				index += 1;
				break;
			case '--hover-if-present':
				options.actions.push({
					type: 'hover',
					selector: readValue(rest, index, arg),
					optional: true
				});
				index += 1;
				break;
			case '--wait-until': {
				const value = readValue(rest, index, arg);

				if (value !== 'load' && value !== 'domcontentloaded' && value !== 'networkidle') {
					throw new Error('--wait-until must be load, domcontentloaded, or networkidle.');
				}

				options.waitForLoadState = value;
				index += 1;
				break;
			}
			case '--timeout':
				options.timeoutMs = parseInteger(readValue(rest, index, arg), arg);
				index += 1;
				break;
			case '--browser': {
				const value = readValue(rest, index, arg);

				if (value !== 'chromium' && value !== 'chrome') {
					throw new Error('--browser must be chromium or chrome.');
				}

				options.browser = value;
				index += 1;
				break;
			}
			case '--headed':
				options.headed = true;
				break;
			case '--no-full-page':
				options.fullPage = false;
				break;
			case '--device-scale-factor':
				options.deviceScaleFactor = parsePositiveNumber(readValue(rest, index, arg), arg);
				index += 1;
				break;
			case '--temp':
				break;
			case '--json':
				options.json = true;
				break;
			case '--no-report':
				// Accepted for 0.2 compatibility; there is no reporting to turn off.
				break;
			case '--api-url':
			case '--license-key':
				// Accepted for 0.2 compatibility; the value is ignored.
				readValue(rest, index, arg);
				index += 1;
				break;
			default:
				throw new Error(`Unknown option: ${arg}`);
		}
	}

	return { name: 'capture', options };
}

function parseArgs(args: string[]): ParsedCommand {
	const first = args[0];

	if (!first || first === '--help' || first === '-h' || first === 'help') {
		return { name: 'help' };
	}

	if (first === '--version' || first === '-v' || first === 'version') {
		return { name: 'version' };
	}

	if (first === 'instructions') {
		if (args.length > 1) {
			throw new Error('Usage: agentshot instructions');
		}

		return { name: 'instructions' };
	}

	// auth, logout and feedback only print a message now, so they accept any
	// arguments that older versions took (a key, a feedback message, --kind ...).
	if (first === 'auth' || first === 'logout' || first === 'feedback') {
		return { name: first, json: args.includes('--json') };
	}

	if (first === 'status') {
		return { name: 'status', ...parseJsonOnlyOptions(args.slice(1)) };
	}

	if (first === 'doctor') {
		return { name: 'doctor', ...parseJsonOnlyOptions(args.slice(1)) };
	}

	if (first === 'install-browser') {
		return parseInstallBrowser(args.slice(1));
	}

	return parseCapture(args);
}

async function readPackageVersion() {
	const currentFile = fileURLToPath(import.meta.url);
	const packageJsonPath = join(dirname(currentFile), '..', 'package.json');

	try {
		const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version?: string };
		return packageJson.version ?? '0.1.0';
	} catch {
		return '0.1.0';
	}
}

async function readAgentInstructions() {
	const currentFile = fileURLToPath(import.meta.url);
	const instructionsPath = join(dirname(currentFile), '..', 'AGENT-INSTRUCTIONS.md');
	return readFile(instructionsPath, 'utf8');
}

function printMessage(json: boolean, message: string, extra: Record<string, unknown> = {}) {
	if (json) {
		console.log(JSON.stringify({ ok: true, ...extra, message }, null, 2));
	} else {
		console.log(message);
	}
}

async function run() {
	await removeLegacyUsageQueue();

	const command = parseArgs(process.argv.slice(2));

	if (command.name === 'help') {
		printHelp();
		return;
	}

	if (command.name === 'version') {
		console.log(await readPackageVersion());
		return;
	}

	if (command.name === 'instructions') {
		console.log((await readAgentInstructions()).trim());
		return;
	}

	if (command.name === 'auth') {
		printMessage(
			command.json,
			'AgentScreenshots is free and open source. It needs no account and no license key, so there is nothing to authenticate.'
		);
		return;
	}

	if (command.name === 'logout') {
		printMessage(
			command.json,
			'AgentScreenshots is free and open source. It keeps no account or license key, so there is nothing to log out of.'
		);
		return;
	}

	if (command.name === 'feedback') {
		printMessage(
			command.json,
			`Report bugs and ideas as a GitHub issue: ${ISSUES_URL}\nagentshot makes no network calls of its own, so it does not send feedback itself.`,
			{ url: ISSUES_URL }
		);
		return;
	}

	if (command.name === 'status') {
		const status = await getStatus(await readPackageVersion());
		console.log(command.json ? JSON.stringify(status, null, 2) : formatStatus(status));
		return;
	}

	if (command.name === 'doctor') {
		const result = await runDoctor();

		if (command.json) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			console.log(`agentshot doctor: ${result.status}`);

			for (const check of result.checks) {
				console.log(`${check.status.padEnd(4)} ${check.name}: ${check.message}`);
			}
		}

		if (result.status === 'fail') {
			process.exitCode = 1;
		}

		return;
	}

	if (command.name === 'install-browser') {
		const result = await ensureBrowserInstalled({ force: command.force });

		if (command.json) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			console.log(result.message);

			if (result.status === 'skipped' && result.reason === 'system_browser_found') {
				console.log('Use `agentshot install-browser --force` to download Playwright Chromium anyway.');
			}
		}

		return;
	}

	const result = await capture(command.options);

	if (command.options.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	console.log(
		`Captured ${result.width}x${result.height} -> ${result.output} (${(result.durationMs / 1000).toFixed(1)}s)`
	);
}

run().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
