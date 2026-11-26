import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

// agentshot 0.2 and earlier kept a usage queue next to its config file.
// Nothing reads it any more, so remove it quietly if it is still there.
function getLegacyConfigDir() {
	if (process.env.AGENTSHOT_CONFIG) {
		return dirname(process.env.AGENTSHOT_CONFIG);
	}

	const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
	return join(configHome, 'agentshot');
}

export async function removeLegacyUsageQueue() {
	try {
		await rm(join(getLegacyConfigDir(), 'usage-queue.jsonl'), { force: true });
	} catch {
		// Leftover cleanup must never get in the way of a capture.
	}
}
