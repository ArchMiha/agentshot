export type CaptureOptions = {
	url: string;
	output: string;
	temporary: boolean;
	width: number;
	viewportHeight: number;
	deviceScaleFactor: number;
	waitMs: number;
	timeoutMs: number;
	scroll: boolean;
	actions: Array<{
		type: 'click' | 'hover';
		selector: string;
		optional: boolean;
	}>;
	selector: string | null;
	selectorIndex: number;
	padding: number;
	fromY: number | null;
	toY: number | null;
	clipHeight: number | null;
	fullPage: boolean;
	waitForSelector: string | null;
	waitForLoadState: 'load' | 'domcontentloaded' | 'networkidle';
	browser: 'chromium' | 'chrome';
	headed: boolean;
	json: boolean;
};

export type CaptureResult = {
	output: string;
	url: string;
	temporary: boolean;
	width: number;
	height: number;
	fileSizeBytes: number;
	durationMs: number;
	mode: 'full-page' | 'clip' | 'selector';
};

export type DoctorCheck = {
	name: string;
	status: 'ok' | 'warn' | 'fail';
	message: string;
};

export type DoctorResult = {
	status: 'ok' | 'warn' | 'fail';
	checks: DoctorCheck[];
};
