import { resolve } from 'node:path';

/** Project root (works from both `src/` via ts and `dist/` after build). */
export const ROOT_DIR = resolve(__dirname, '..', '..', '..');
export const PUBLIC_DIR = resolve(ROOT_DIR, 'public');
export const VIEWS_DIR = resolve(ROOT_DIR, 'views');
