import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { findSystemBrowser } from './browser.js';

const require = createRequire(import.meta.url);

function readPlaywrightVersion() {
	try {
		return (require('playwright/package.json') as { version?: string }).version ?? null;
	} catch {
		return null;
	}
}

async function findPlaywrightChromium() {
	try {
		const path = chromium.executablePath();
		await access(path);
		return path;
	} catch {
		return null;
	}
}

export async function getStatus(version: string) {
	const systemBrowser = await findSystemBrowser();

	return {
		version,
		license: 'MIT',
		node: process.versions.node,
		platform: `${process.platform} ${process.arch}`,
		playwright: readPlaywrightVersion(),
		systemBrowser: systemBrowser
			? { label: systemBrowser.label, path: systemBrowser.executablePath, source: systemBrowser.source }
			: null,
		playwrightChromium: await findPlaywrightChromium(),
		tempDir: join(tmpdir(), 'agentshot')
	};
}

export function formatStatus(status: Awaited<ReturnType<typeof getStatus>>) {
	const browser = status.systemBrowser
		? `${status.systemBrowser.label} at ${status.systemBrowser.path}`
		: 'no system Chrome/Chromium found';

	const rows: Array<[string, string]> = [
		['Node', `${status.node} (${status.platform})`],
		['Playwright', status.playwright ?? 'unknown'],
		['System browser', browser],
		[
			'Playwright Chromium',
			status.playwrightChromium ?? 'not installed (`agentshot install-browser` downloads it)'
		],
		['Temp captures', status.tempDir]
	];

	return [
		`agentshot ${status.version}`,
		'Free and open source (MIT). No account, no license key, no network calls of its own.',
		...rows.map(([label, value]) => `${`${label}:`.padEnd(21)}${value}`)
	].join('\n');
}
