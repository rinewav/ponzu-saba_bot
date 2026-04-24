import { readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

export async function readdirRecursive(dirUrl: URL): Promise<string[]> {
  const dirPath = resolve(dirUrl.pathname);
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await readdirRecursive(new URL(`file://${fullPath}`));
      files.push(...subFiles);
    } else {
      const ext = extname(entry.name);
      if (ext === '.js' || ext === '.ts') {
        files.push(fullPath);
      }
    }
  }

  return files;
}