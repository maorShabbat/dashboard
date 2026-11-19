// Usage: npm run foundry:frontend -- <web-sdk checkout> <compiled game dir> <math-sdk frontend config json> [appName]
import { buildFrontend } from './frontend';

const [webSdk, gameDir, frontConfig, appName] = process.argv.slice(2);
if (!webSdk || !gameDir || !frontConfig) throw new Error('usage: frontend-cli <web-sdk> <game dir> <config_fe json> [appName]');
const r = buildFrontend({ webSdk, gameDir, frontConfig, appName });
console.log(`frontend ${r.appName} -> ${r.appDir} (devArt ${r.devArt}, ${r.files.length} files written)`);
console.log(`next: cd ${webSdk} && pnpm install --offline && pnpm run build --filter=${r.appName.replace(/_/g, '-')}`);
