import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_DIR } from './paths';

export const DEFAULT_ENTITY_NAME = 'PT JAKARTA INTERNATIONAL EXPO';

/** Entity (company) name, falling back to PT JAKARTA INTERNATIONAL EXPO when empty. */
export function entityName(name?: unknown): string {
  const value = typeof name === 'string' ? name.trim() : name;
  return value ? String(value) : DEFAULT_ENTITY_NAME;
}

const logoCache = new Map<string, string | null>();

function findLogoFile(baseName: string): string | null {
  if (logoCache.has(baseName)) return logoCache.get(baseName)!;

  const candidates = [
    `${baseName}.png`,
    `${baseName.replaceAll(' ', '_')}.png`,
    `${baseName.replaceAll(' ', '_').toLowerCase()}.png`,
  ];
  const file = candidates.find((f) => existsSync(join(PUBLIC_DIR, 'images', 'logo', f))) ?? null;
  logoCache.set(baseName, file);
  return file;
}

/**
 * Relative public path of the entity logo (e.g. `images/logo/PT X.png`).
 * Falls back to the default entity logo, then to the generic email header.
 */
export function entityLogoPath(name?: unknown): string {
  for (const baseName of [entityName(name), DEFAULT_ENTITY_NAME]) {
    const file = findLogoFile(baseName);
    if (file) return `images/logo/${file}`;
  }
  return 'images/email_header.png';
}
