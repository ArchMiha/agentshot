import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSystemBrowser, launchAgentshotBrowser } from './browser.js';
import type { DoctorCheck, DoctorResult } from './types.js';

function getOverallStatus(checks: DoctorCheck[]): DoctorResult['status'] {
	if (checks.some((check) => check.status === 'fail')) {
		return 'fail';
	}

	if (checks.some((check) => check.status === 'warn')) {
		return 'warn';
	}

	return 'ok';
}

function getNodeMajor() {
	return Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
}

async function checkWritableTempFile(): Promise<DoctorCheck> {
	const directory = await mkdtemp(join(tmpdir(), 'agentshot-'));
	const path = join(directory, 'doctor.txt');

	try {
		await writeFile(path, 'ok\n');
		return {
			name: 'output',
			status: 'ok',
			message: `Can write screenshot output files (${directory}).`
		};
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function checkBrowser(): Promise<DoctorCheck> {
	const launch = await launchAgentshotBrowser({
		browser: 'chromium',
		headed: false
	});
	const { browser } = launch;

	try {
		const page = await browser.newPage();
		await page.setContent('<!doctype html><title>agentshot doctor</title><p>ok</p>');

		return {
			name: 'browser',
			status: 'ok',
			message: `Local browser launches successfully (${launch.source}).`
		};
	} finally {
		await browser.close();
	}
}

export async function runDoctor(): Promise<DoctorResult> {
	const checks: DoctorCheck[] = [];

	checks.push({
		name: 'node',
		status: getNodeMajor() >= 20 ? 'ok' : 'fail',
		message: `Node ${process.versions.node} detected. agentshot requires Node 20+.`
	});

	try {
		const systemBrowser = await findSystemBrowser();
		checks.push({
			name: 'browser-detection',
			status: systemBrowser ? 'ok' : 'warn',
			message: systemBrowser
				? `Found local browser at ${systemBrowser.executablePath}.`
				: 'No system Chrome/Chromium browser found. Playwright Chromium will be used if installed.'
		});
		checks.push(await checkBrowser());
	} catch (error) {
		checks.push({
			name: 'browser',
			status: 'fail',
			message:
				error instanceof Error
					? error.message
					: 'No local browser could launch. Run `agentshot install-browser` to download Playwright Chromium.'
		});
	}

	try {
		checks.push(await checkWritableTempFile());
	} catch (error) {
		checks.push({
			name: 'output',
			status: 'fail',
			message: error instanceof Error ? error.message : 'Could not write a temp output file.'
		});
	}

	return {
		status: getOverallStatus(checks),
		checks
	};
}
