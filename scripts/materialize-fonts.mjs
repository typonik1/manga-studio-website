#!/usr/bin/env node
/**
 * Материализует self-hosted шрифты: декодирует public/fonts/*.b64 (текстовый
 * base64) в бинарные файлы рядом (например, balsamiq-sans-400-latin.woff2.b64
 * → balsamiq-sans-400-latin.woff2).
 *
 * Бинарные .woff2 не хранятся в git напрямую — в репозитории лежат их
 * base64-версии. Скрипт запускается автоматически перед `dev` и `build`
 * (см. predev/prebuild в package.json) и ничего не делает, если файлы уже
 * на месте и совпадают по размеру.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fontsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');

if (!existsSync(fontsDir)) {
  console.log('[fonts] public/fonts не найден — пропускаем');
  process.exit(0);
}

let written = 0;
for (const entry of readdirSync(fontsDir)) {
  if (!entry.endsWith('.b64')) continue;
  const source = join(fontsDir, entry);
  const target = join(fontsDir, entry.slice(0, -'.b64'.length));
  const bytes = Buffer.from(readFileSync(source, 'utf8').replace(/\s/g, ''), 'base64');
  if (existsSync(target) && statSync(target).size === bytes.length) continue;
  writeFileSync(target, bytes);
  written += 1;
  console.log(`[fonts] записан ${entry.slice(0, -'.b64'.length)} (${bytes.length} байт)`);
}

if (written === 0) console.log('[fonts] все файлы шрифтов актуальны');
