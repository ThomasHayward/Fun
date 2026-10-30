// Builds the site into dist/: copies static files (HTML, CSS, icons, ...) and compiles TypeScript.
import { cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const SKIP = new Set(['.git', '.github', 'node_modules', 'dist', 'scripts', 'package.json', 'package-lock.json', 'README.md', '.gitignore']);

rmSync('dist', { recursive: true, force: true });
cpSync('.', 'dist', {
  recursive: true,
  filter: (src) => {
    const name = basename(src);
    return src === '.' || (!SKIP.has(name) && !name.endsWith('.ts') && !name.startsWith('tsconfig'));
  },
});

const tsc = (project) => execFileSync('npx', ['tsc', '-p', project], { stdio: 'inherit' });
tsc('tsconfig.json');
tsc('tsconfig.sw.json');
console.log('Built to dist/');
