import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const translateActions = await readFile(new URL('../utils/translateActions.ts', import.meta.url), 'utf8');
const cleanupPanel = await readFile(new URL('../components/editor/panels/CleanupPanel.tsx', import.meta.url), 'utf8');
const redrawRoute = await readFile(new URL('../app/api/translate/redraw/route.ts', import.meta.url), 'utf8');
const routerServer = await readFile(new URL('../lib/routerai/server.ts', import.meta.url), 'utf8');
const routerClient = await readFile(new URL('../lib/routerai/client.ts', import.meta.url), 'utf8');

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

test('AI translation redraws the crop and keeps the result inside the selection mask', () => {
  assert.match(translateActions, /translateRegionWithAi/);
  const aiSection = translateActions.slice(translateActions.indexOf('export async function translateRegionWithAi'));
  assert.match(aiSection, /redrawRegion/);
  assert.match(aiSection, /createCleanupPatch/);
  assert.match(aiSection, /Переведи весь текст/);
});

test('cleanup panel exposes AI translation and the OCR fallback', () => {
  assert.match(cleanupPanel, /Перевод AI/);
  assert.match(cleanupPanel, /Перевести бабл/);
});

test('image-model operations use a strict selection crop', () => {
  const aiSection = translateActions.slice(translateActions.indexOf('export async function translateRegionWithAi'));
  const redrawSection = translateActions.slice(translateActions.indexOf('export async function redrawSfx'));
  assert.match(aiSection, /buildBubbleCrop\(doc, 0, IMAGE_MODEL_MAX_DIMENSION\)/);
  assert.match(redrawSection, /buildBubbleCrop\(doc, 0, IMAGE_MODEL_MAX_DIMENSION\)/);
});

test('translation settings can disable image-model operations', () => {
  assert.match(cleanupPanel, /Не использовать image-модель/);
  assert.match(cleanupPanel, /disableImageTranslationModel/);
  assert.match(cleanupPanel, /aiFallbackVisible/);
});

test('image model configuration and request limits are explicit', () => {
  assert.match(routerServer, /ROUTERAI_IMAGE_MODEL/);
  assert.match(routerServer, /ROUTERAI_TEXT_MODEL/);
  assert.match(redrawRoute, /ROUTERAI_IMAGE_MODEL/);
  assert.match(redrawRoute, /max_tokens/);
  assert.match(redrawRoute, /temperature:\s*0\.4/);
  assert.match(translateActions, /IMAGE_MODEL_MAX_DIMENSION\s*=\s*768/);
  assert.match(translateActions, /resize.*max/i);
});

test('image usage is counted per session and retries are explicit', () => {
  assert.match(routerClient, /getImageUsage/);
  assert.match(routerClient, /imageCalls/);
  assert.match(cleanupPanel, /Повторить/);
  assert.match(cleanupPanel, /примерн|стоим/i);
});
