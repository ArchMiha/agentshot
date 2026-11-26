import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, isAbsolute, join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, type Browser } from 'playwright';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export type BrowserInstallResult =
	| {
			status: 'skipped';
			reason: 'env_skip' | 'system_browser_found';
			message: string;
			executablePath?: string;
	  }
	| {
			status: 'installed';
			message: string;
	  };

export type SystemBrowser = {
	executablePath: string;
	label: string;
	source: 'env' | 'path' | 'known-path';
};

function hasPathSeparator(value: string) {
	return value.includes('/') || value.includes('\\');
}

function truthyEnv(value: string | undefined) {
	return value === '1' || value === 'true' || value === 'yes';
}

function getEnvBrowserCandidate() {
	return process.env.AGENTSHOT_BROWSER_PATH || process.env.AGENTSHOT_CHROME_PATH || null;
}

async function canAccess(path: string) {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

async function resolveCommand(command: string) {
	const resolver = process.platform === 'win32' ? 'where.exe' : 'which';

	try {
		const { stdout } = await execFileAsync(resolver, [command]);
		return stdout
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean) ?? null;
	} catch {
		return null;
	}
}

function getKnownBrowserPaths() {
	if (process.platform === 'darwin') {
		return [
			'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
			'/Applications/Chromium.app/Contents/MacOS/Chromium',
			'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
			'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
		];
	}

	if (process.platform === 'win32') {
		const prefixes = [
			process.env.LOCALAPPDATA,
			process.env.PROGRAMFILES,
			process.env['PROGRAMFILES(X86)']
		].filter((value): value is string => Boolean(value));

		return prefixes.flatMap((prefix) => [
			join(prefix, 'Google/Chrome/Application/chrome.exe'),
			join(prefix, 'Chromium/Application/chrome.exe'),
			join(prefix, 'Microsoft/Edge/Application/msedge.exe'),
			join(prefix, 'BraveSoftware/Brave-Browser/Application/brave.exe')
		]);
	}

	return [];
}

function getPathBrowserCommands() {
	if (process.platform === 'win32') {
		return ['chrome.exe', 'msedge.exe', 'brave.exe'];
	}

	return [
		'google-chrome-stable',
		'google-chrome',
		'chrome',
		'chromium',
		'chromium-browser',
		'microsoft-edge-stable',
		'microsoft-edge',
		'brave-browser',
		'brave'
	];
}

async function resolveBrowserCandidate(candidate: string) {
	if (isAbsolute(candidate) || hasPathSeparator(candidate)) {
		return (await canAccess(candidate)) ? candidate : null;
	}

	return resolveCommand(candidate);
}

function labelForPath(path: string) {
	const parts = path.split(/[\\/]/);
	return parts.at(-1) || path;
}

export async function findSystemBrowser(): Promise<SystemBrowser | null> {
	const seen = new Set<string>();
	const envCandidate = getEnvBrowserCandidate();

	if (envCandidate) {
		const executablePath = await resolveBrowserCandidate(envCandidate);

		if (executablePath) {
			return {
				executablePath,
				label: 'configured browser',
				source: 'env'
			};
		}
	}

	for (const command of getPathBrowserCommands()) {
		const executablePath = await resolveBrowserCandidate(command);

		if (executablePath && !seen.has(executablePath)) {
			seen.add(executablePath);
			return {
				executablePath,
				label: command,
				source: 'path'
			};
		}
	}

	for (const path of getKnownBrowserPaths()) {
		if (seen.has(path)) {
			continue;
		}

		if (await canAccess(path)) {
			return {
				executablePath: path,
				label: labelForPath(path),
				source: 'known-path'
			};
		}
	}

	return null;
}

export function shouldSkipBrowserInstall() {
	return truthyEnv(process.env.AGENTSHOT_SKIP_BROWSER_INSTALL);
}

export async function installPlaywrightChromium() {
	const playwrightCliPath = require.resolve('playwright/cli');

	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, [playwrightCliPath, 'install', 'chromium'], {
			stdio: 'inherit',
			env: {
				...process.env,
				PATH: process.env.PATH?.split(delimiter).join(delimiter)
			}
		});

		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`playwright install chromium exited with code ${code ?? 'unknown'}.`));
			}
		});
	});
}

export async function ensureBrowserInstalled(options: {
	force?: boolean;
	respectSkipEnv?: boolean;
} = {}): Promise<BrowserInstallResult> {
	if (options.respectSkipEnv && shouldSkipBrowserInstall()) {
		return {
			status: 'skipped',
			reason: 'env_skip',
			message:
				'Skipped browser install because AGENTSHOT_SKIP_BROWSER_INSTALL is set. Run `agentshot install-browser` later if needed.'
		};
	}

	if (!options.force) {
		const systemBrowser = await findSystemBrowser();

		if (systemBrowser) {
			return {
				status: 'skipped',
				reason: 'system_browser_found',
				executablePath: systemBrowser.executablePath,
				message: `Found local browser (${systemBrowser.label}) at ${systemBrowser.executablePath}; skipping Playwright Chromium download.`
			};
		}
	}

	await installPlaywrightChromium();

	return {
		status: 'installed',
		message: 'Playwright Chromium installed.'
	};
}

function browserLaunchError(error: unknown) {
	const original = error instanceof Error ? error.message : String(error);
	return new Error(
		`Could not launch a local browser. Run \`agentshot doctor\` for details or \`agentshot install-browser\` to download Playwright Chromium.\n\nOriginal error: ${original}`
	);
}

export async function launchAgentshotBrowser(options: {
	browser: 'chromium' | 'chrome';
	headed: boolean;
}): Promise<{ browser: Browser; source: string }> {
	if (options.browser === 'chrome') {
		try {
			return {
				browser: await chromium.launch({
					channel: 'chrome',
					headless: !options.headed
				}),
				source: 'Chrome channel'
			};
		} catch (error) {
			throw browserLaunchError(error);
		}
	}

	const systemBrowser = await findSystemBrowser();
	const errors: string[] = [];

	if (systemBrowser) {
		try {
			return {
				browser: await chromium.launch({
					executablePath: systemBrowser.executablePath,
					headless: !options.headed
				}),
				source: `${systemBrowser.label} at ${systemBrowser.executablePath}`
			};
		} catch (error) {
			errors.push(error instanceof Error ? error.message : String(error));
		}
	}

	try {
		return {
			browser: await chromium.launch({
				headless: !options.headed
			}),
			source: 'Playwright Chromium'
		};
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
		throw browserLaunchError(errors.join('\n\n'));
	}
}
