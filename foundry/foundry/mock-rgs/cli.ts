// Usage: npm run foundry:mock-rgs -- <publish_files dir> [port] [maxBooks]
import { loadLibrary } from './books';
import { createMockRgs } from './server';

const [dir, port = '3939', maxBooks = '20000'] = process.argv.slice(2);
if (!dir) throw new Error('usage: cli.ts <publish_files dir> [port] [maxBooks]');
const library = await loadLibrary(dir, { maxBooks: Number(maxBooks) });
const { server } = createMockRgs({ library });
server.listen(Number(port), () => console.log(`mock RGS on http://localhost:${port} (modes: ${[...library.modes.keys()].join(', ')})`));
