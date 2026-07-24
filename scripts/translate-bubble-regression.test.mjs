import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const translateActions = await readFile(new URL('../utils/translateActions.ts', import.meta.url), 'utf8');
const cleanupPanel = await readFile(new URL('../components/editor/panels/CleanupPanel.tsx', import.meta.url), 'utf8');

test('translateBubble uses a mask-bounded color fill instead of inpainting', () => {
  const translateSection = translateActions.slice(
    translateActions.indexOf('export async function translateBubble'),
    translateActions.indexOf('export async function redrawSfx'),
  );
  assert.match(translateSection, /createColorPatch/);
  assert.match(translateSection, /erodeMaskCanvas/);
  assert.doesNotMatch(translateSection, /inpaintMaskedArea/);
});

test('redrawSfx composites the model result through the selection mask', () => {
  const redrawSection = translateActions.slice(translateActions.indexOf('export async function redrawSfx'));
  assert.match(redrawSection, /createCleanupPatch/);
  assert.doesNotMatch(redrawSection, /src:\s*patch\.toDataURL/);
});

test('cleanup panel exposes an editable conservative AI instruction', () => {
  assert.match(cleanupPanel, /redrawPrompt/);
  assert.match(cleanupPanel, /Инструкция для AI/);
});
