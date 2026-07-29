# Paste Images as Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make external PNG/JPEG/WebP files pasted with Ctrl+V become transformable raster layers of the active page, while preserving new-page behavior when no document exists.

**Architecture:** Extract pure placement math and layer construction from `CanvasArea`, then let the paste handler route internal fragments, external images, and native text paste explicitly. Reuse `AiRasterLayer` with operation `drawing` so current transform, perspective, layer order, selection, and undo behavior work without new server/API code.

**Tech Stack:** React 19, TypeScript, Zustand, browser Clipboard/File APIs, Canvas/Image decoding, Vitest.

## Global Constraints

- Do not change API routes or server validation.
- Internal copied selection fragments still paste in their original position.
- External image files paste as unlocked selected AI layers when a document is active.
- Without an active document, external images continue through `loadImagesFromFiles` as new pages.
- Inputs, textareas, selects, contenteditable, and inline text editing keep native text paste.
- Preserve aspect ratio and pixel size; uniformly fit to 95% of the document only when oversized.
- Multiple pasted files become multiple layers with visible cascade offsets.

---

### Task 1: Pure Placement and Layer Construction

**Files:**
- Create: `utils/pastedImageLayers.ts`
- Create: `tests/pastedImageLayers.test.ts`

**Interfaces:**
- Produces:

```ts
export interface PastedImageInfo {
  src: string;
  width: number;
  height: number;
  name?: string;
}

export function planPastedImagePlacement(
  docWidth: number,
  docHeight: number,
  imageWidth: number,
  imageHeight: number,
  index?: number,
): CropRect;

export function createPastedImageLayer(
  doc: Pick<ImageDocument, 'id' | 'width' | 'height' | 'aiLayers'>,
  image: PastedImageInfo,
  index?: number,
): AiRasterLayer;
```

- [ ] **Step 1: Write failing placement tests**

```ts
it('keeps a 400x300 image at pixel size and centers it on 1000x800', () => {
  expect(planPastedImagePlacement(1000, 800, 400, 300)).toEqual({
    x: 0.3, y: 0.3125, width: 0.4, height: 0.375,
  });
});

it('fits oversized images to 95 percent without changing aspect ratio', () => {
  const crop = planPastedImagePlacement(1000, 1000, 2000, 1000);
  expect(crop.width).toBeCloseTo(0.95);
  expect(crop.height).toBeCloseTo(0.475);
});

it('creates an unlocked selected-compatible drawing layer', () => {
  const layer = createPastedImageLayer(doc, { src: 'data:image/png;base64,x', width: 400, height: 300 });
  expect(layer).toMatchObject({ operation: 'drawing', locked: false, visible: true, opacity: 1 });
});
```

Add cases for zero dimensions, unique names, and cascade offsets clamped inside
the document.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/pastedImageLayers.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure placement and construction**

Use:

```ts
const fit = Math.min(1, (docWidth * 0.95) / imageWidth, (docHeight * 0.95) / imageHeight);
const drawW = imageWidth * fit;
const drawH = imageHeight * fit;
const offset = Math.min(index * 16, Math.min(docWidth, docHeight) * 0.1);
```

Create a full-document transparent data URL later in the browser adapter; the
pure layer constructor receives that prepared `src` and uses `crop` to frame
the visible image.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- tests/pastedImageLayers.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/pastedImageLayers.ts tests/pastedImageLayers.test.ts
git commit -m "feat: plan pasted image layers"
```

### Task 2: Clipboard Routing and Browser Adapter

**Files:**
- Modify: `utils/pastedImageLayers.ts`
- Modify: `components/editor/CanvasArea.tsx`
- Create: `tests/clipboardPasteRouting.test.ts`

**Interfaces:**
- Consumes: `planPastedImagePlacement`, `createPastedImageLayer`.
- Produces:

```ts
export function shouldKeepNativePaste(target: EventTarget | null): boolean;
export function extractClipboardImageFiles(data: DataTransfer): File[];
export async function decodePastedImage(file: File): Promise<PastedImageInfo>;
export async function pasteExternalImagesAsLayers(files: File[], documentId: string): Promise<string[]>;
```

- [ ] **Step 1: Write failing routing tests**

Assert `shouldKeepNativePaste` returns true for input/textarea/select and
contenteditable, false for canvas/div; extraction deduplicates the same file
visible through both `data.files` and `data.items`; non-image files are ignored.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/clipboardPasteRouting.test.ts`

Expected: FAIL because routing helpers do not exist.

- [ ] **Step 3: Implement decode and layer insertion**

Decode each file with `createImageBitmap` when available and HTMLImageElement
fallback otherwise. Draw it onto a full-document canvas at the planned crop,
encode PNG to preserve transparency, call `addAiLayer`, and return inserted
layer ids. The final `addAiLayer` call selects the newest layer and creates the
existing history entry.

- [ ] **Step 4: Replace the external-file branch in CanvasArea**

Use explicit order:

```ts
if (shouldKeepNativePaste(event.target)) return;
if (hasDoc && shouldPasteFragment(data)) {
  event.preventDefault();
  void pasteFragmentAsLayer();
  return;
}
const files = extractClipboardImageFiles(data);
if (files.length === 0) return;
event.preventDefault();
if (hasDoc) {
  void pasteExternalImagesAsLayers(files, activeDoc.id);
} else {
  void handleFiles(files);
}
```

Show `«Изображение вставлено новым слоем»` or a readable red error chip.

- [ ] **Step 5: Run tests and verification**

Run:

```bash
npm test -- tests/clipboardPasteRouting.test.ts tests/pastedImageLayers.test.ts
npm test
npx tsc --noEmit
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Browser smoke**

1. Open a page, copy a PNG in Finder/Explorer, focus the canvas, press Ctrl+V.
2. Verify page count is unchanged and a new unlocked drawing layer is selected.
3. Drag, resize, rotate, perspective-warp, reorder, delete, and Ctrl+Z.
4. Paste an oversized transparent PNG and confirm 95% fit and transparency.
5. Paste two images and confirm two cascaded layers.
6. Paste text into bubble/text inputs and confirm native paste.
7. Start with no page and paste a PNG; confirm a new page is created.
8. Copy an internal selection and paste; confirm exact-position fragment behavior remains.

- [ ] **Step 7: Commit**

```bash
git add utils/pastedImageLayers.ts components/editor/CanvasArea.tsx tests/clipboardPasteRouting.test.ts
git commit -m "feat: paste external images as layers"
```
