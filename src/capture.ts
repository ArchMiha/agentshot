import { mkdir, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { type Browser, type Locator, type Page } from 'playwright';
import { launchAgentshotBrowser } from './browser.js';
import type { CaptureOptions, CaptureResult } from './types.js';

type Clip = {
	x: number;
	y: number;
	width: number;
	height: number;
};

type ImageFormat = 'jpeg' | 'png';

function sleep(ms: number) {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function clampClip(clip: Clip, pageWidth: number, pageHeight: number): Clip {
	const x = Math.max(0, Math.floor(clip.x));
	const y = Math.max(0, Math.floor(clip.y));
	const width = Math.max(1, Math.min(Math.floor(clip.width), Math.floor(pageWidth - x)));
	const height = Math.max(1, Math.min(Math.floor(clip.height), Math.floor(pageHeight - y)));

	return { x, y, width, height };
}

function getFormat(output: string): ImageFormat {
	const extension = extname(output).toLowerCase();
	return extension === '.jpg' || extension === '.jpeg' ? 'jpeg' : 'png';
}

function getPngDimensions(image: Buffer) {
	if (image.length < 24 || image.toString('ascii', 1, 4) !== 'PNG') {
		return null;
	}

	return {
		width: image.readUInt32BE(16),
		height: image.readUInt32BE(20)
	};
}

function getJpegDimensions(image: Buffer) {
	let offset = 2;

	while (offset < image.length - 9) {
		if (image[offset] !== 0xff) {
			offset += 1;
			continue;
		}

		const marker = image[offset + 1];
		offset += 2;

		if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
			continue;
		}

		const segmentLength = image.readUInt16BE(offset);
		const isStartOfFrame =
			(marker >= 0xc0 && marker <= 0xc3) ||
			(marker >= 0xc5 && marker <= 0xc7) ||
			(marker >= 0xc9 && marker <= 0xcb) ||
			(marker >= 0xcd && marker <= 0xcf);

		if (isStartOfFrame) {
			return {
				height: image.readUInt16BE(offset + 3),
				width: image.readUInt16BE(offset + 5)
			};
		}

		offset += segmentLength;
	}

	return null;
}

function getImageDimensions(image: Buffer, format: ImageFormat) {
	return format === 'png' ? getPngDimensions(image) : getJpegDimensions(image);
}

async function getPageSize(page: Page) {
	return page.evaluate(() => {
		const root = document.scrollingElement || document.documentElement;
		const body = document.body;

		return {
			width: Math.max(root.scrollWidth, body?.scrollWidth ?? 0, window.innerWidth),
			height: Math.max(root.scrollHeight, body?.scrollHeight ?? 0, window.innerHeight)
		};
	});
}

async function triggerLazyLoadedContent(page: Page) {
	await page.evaluate(async () => {
		const sleepInPage = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
		document
			.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')
			.forEach((image) => (image.loading = 'eager'));

		const root = document.scrollingElement || document.documentElement;
		const viewport = window.innerHeight || 800;
		const step = Math.max(240, Math.floor(viewport * 0.75));
		const height = () => Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0);

		for (let y = 0; y < height(); y += step) {
			window.scrollTo(0, y);
			window.dispatchEvent(new Event('scroll'));
			await sleepInPage(180);
		}

		window.scrollTo(0, height());
		window.dispatchEvent(new Event('scroll'));
		await sleepInPage(350);
		window.scrollTo(0, 0);
		await sleepInPage(250);
	});
}

async function findVisibleLocatorInFrames(page: Page, selector: string, timeoutMs: number): Promise<Locator> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown = null;

	while (Date.now() <= deadline) {
		for (const frame of page.frames()) {
			const locator = frame.locator(selector).first();

			try {
				if (await locator.isVisible({ timeout: 100 })) {
					return locator;
				}
			} catch (error) {
				lastError = error;
			}
		}

		await sleep(100);
	}

	if (lastError instanceof Error) {
		throw lastError;
	}

	throw new Error(`Timed out waiting for visible selector before click: ${selector}`);
}

async function runPreCaptureActions(page: Page, actions: CaptureOptions['actions'], timeoutMs: number) {
	for (const action of actions) {
		const timeout = action.optional ? Math.min(timeoutMs, 2500) : timeoutMs;

		try {
			const locator = await findVisibleLocatorInFrames(page, action.selector, timeout);

			if (action.type === 'click') {
				await locator.click({ timeout });
			} else {
				await locator.hover({ timeout });
			}

			await sleep(250);
		} catch (error) {
			if (!action.optional) {
				throw error;
			}
		}
	}
}

async function computeSelectorClip(
	page: Page,
	selector: string,
	index: number,
	padding: number,
	timeoutMs: number
) {
	const locator = page.locator(selector).nth(index);
	await locator.waitFor({ state: 'visible', timeout: timeoutMs });
	await locator.scrollIntoViewIfNeeded();
	await sleep(100);

	const box = await locator.evaluate((element, pad) => {
		const rect = element.getBoundingClientRect();
		return {
			x: rect.left + window.scrollX - pad,
			y: rect.top + window.scrollY - pad,
			width: rect.width + pad * 2,
			height: rect.height + pad * 2
		};
	}, padding);

	return box;
}

function computeVerticalClip(options: CaptureOptions, pageWidth: number, pageHeight: number) {
	const y = options.fromY ?? 0;
	let height: number | null = null;

	if (options.toY !== null) {
		height = options.toY - y;
	} else if (options.clipHeight !== null) {
		height = options.clipHeight;
	}

	if (height === null) {
		return null;
	}

	if (height <= 0) {
		throw new Error('Clip height must be greater than 0.');
	}

	return clampClip({ x: 0, y, width: pageWidth, height }, pageWidth, pageHeight);
}

async function launchBrowser(options: CaptureOptions): Promise<Browser> {
	const result = await launchAgentshotBrowser({
		browser: options.browser,
		headed: options.headed
	});
	return result.browser;
}

export async function capture(options: CaptureOptions): Promise<CaptureResult> {
	const startedAt = Date.now();
	const output = resolve(options.output);
	await mkdir(dirname(output), { recursive: true });

	const browser = await launchBrowser(options);

	try {
		const page = await browser.newPage({
			viewport: {
				width: options.width,
				height: options.viewportHeight
			},
			deviceScaleFactor: options.deviceScaleFactor
		});

		page.setDefaultTimeout(options.timeoutMs);
		await page.goto(options.url, {
			waitUntil: options.waitForLoadState,
			timeout: options.timeoutMs
		});

		if (options.waitForSelector) {
			await page.locator(options.waitForSelector).first().waitFor({
				state: 'visible',
				timeout: options.timeoutMs
			});
		}

		await runPreCaptureActions(page, options.actions, options.timeoutMs);

		if (options.scroll) {
			await triggerLazyLoadedContent(page);
		}

		if (options.waitMs > 0) {
			await sleep(options.waitMs);
		}

		const pageSize = await getPageSize(page);
		const format = getFormat(output);
		let screenshotWidth = pageSize.width;
		let screenshotHeight = pageSize.height;
		let screenshotBuffer: Buffer | null = null;
		let mode: CaptureResult['mode'] = 'full-page';

		if (options.selector) {
			const selectorClip = await computeSelectorClip(
				page,
				options.selector,
				options.selectorIndex,
				options.padding,
				options.timeoutMs
			);
			const clip = clampClip(selectorClip, pageSize.width, pageSize.height);
			screenshotBuffer = await page.screenshot({ path: output, fullPage: true, clip, type: format });
			screenshotWidth = clip.width;
			screenshotHeight = clip.height;
			mode = 'selector';
		} else {
			const verticalClip = computeVerticalClip(options, pageSize.width, pageSize.height);

			if (verticalClip) {
				screenshotBuffer = await page.screenshot({ path: output, fullPage: true, clip: verticalClip, type: format });
				screenshotWidth = verticalClip.width;
				screenshotHeight = verticalClip.height;
				mode = 'clip';
			} else {
				screenshotBuffer = await page.screenshot({ path: output, fullPage: options.fullPage, type: format });
				screenshotWidth = options.fullPage ? pageSize.width : options.width;
				screenshotHeight = options.fullPage ? pageSize.height : options.viewportHeight;
			}
		}

		const imageDimensions = screenshotBuffer ? getImageDimensions(screenshotBuffer, format) : null;

		if (imageDimensions) {
			screenshotWidth = imageDimensions.width;
			screenshotHeight = imageDimensions.height;
		}

		const durationMs = Date.now() - startedAt;
		const fileSizeBytes = (await stat(output)).size;

		return {
			output,
			url: options.url,
			temporary: options.temporary,
			width: screenshotWidth,
			height: screenshotHeight,
			fileSizeBytes,
			durationMs,
			mode
		};
	} finally {
		await browser.close();
	}
}
