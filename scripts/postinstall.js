// Sets up a browser after `npm install` (see src/postinstall.ts).
// In a fresh clone dist/ does not exist until `npm run build`, so skip
// quietly instead of failing the install.
import { existsSync } from 'node:fs';

const entry = new URL('../dist/postinstall.js', import.meta.url);

if (existsSync(entry)) {
	await import(entry.href);
}
