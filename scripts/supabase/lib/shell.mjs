/**
 * Shell utilities — directory resolution, file walking.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.html', '.css',
  '.md', '.toml', '.yaml', '.yml', '.env', '.cjs',
]);

export async function walkTextFiles(dir, results = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await walkTextFiles(full, results);
    } else if (TEXT_EXTENSIONS.has(extname(entry.name)) || entry.name === '.env') {
      try {
        const s = await stat(full);
        if (s.size < 5_000_000) results.push(full);
      } catch { /* skip */ }
    }
  }
  return results;
}

export async function readTextFile(path) {
  return readFile(path, 'utf-8');
}
