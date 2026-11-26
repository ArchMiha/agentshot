import { ensureBrowserInstalled } from './browser.js';

async function run() {
	const result = await ensureBrowserInstalled({ respectSkipEnv: true });
	console.log(`[agentshot] ${result.message}`);
}

run().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.warn(`[agentshot] Browser install did not complete: ${message}`);
	console.warn('[agentshot] Install finished anyway. Run `agentshot install-browser` or `agentshot doctor` before your first capture.');
});
