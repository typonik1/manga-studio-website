# Vector Style Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ten transformable bubble kinds, seven transformable pointer kinds, editable solid/gradient/neon styles, reusable gradient presets, and matching preview/export rendering.

**Architecture:** Keep `BubbleObject` and `ShapeObject` as the document objects so existing selection, layer order, history, and export flows remain intact. Add backward-compatible paint/glow fields and pure helpers for normalization, geometry, presets, Konva props, and Canvas 2D paints; React panels only edit those shared values.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zustand, Konva/react-konva, Canvas 2D, Vitest, Testing Library.

## Global Constraints

- Do not change `app/api/*`, Vercel routes, env names, AI contracts, or server-side integrations.
- Preserve legacy `fill` and `stroke` strings; documents without new fields must look unchanged.
- Bubble and shape gradients are stored in local object coordinates and move/rotate/resize with the object.
- Fill supports solid/linear/radial; stroke and arrows support solid/linear with radial converted to linear.
- Gradient presets persist only in localStorage key `manga-studio:paint-presets:v1`; applied object styles remain self-contained.
- All new objects use free width/height resize (`keepRatio=false`), move, rotate, layer order, undo/redo, copy/paste, and export.
- Preview and PNG/JPEG export use the same geometry and style normalization.

---

### Task 1: Test Harness and Paint Data Model

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `types/index.ts`
- Create: `vitest.config.ts`
- Create: `tests/objectPaint.test.ts`
- Create: `utils/objectPaint.ts`

**Interfaces:**
- Produces: `GradientStop`, `PaintStyle`, `GlowStyle`, `GradientPreset`.
- Produces: `normalizePaintStyle(style, fallbackColor)`, `clonePaintStyle(style)`, `normalizeGlowStyle(glow)`.

- [ ] **Step 1: Install the test tools and add scripts**

Run:

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event
```

Add:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
});
```

- [ ] **Step 2: Write failing normalization tests**

```ts
import { describe, expect, it } from 'vitest';
import { clonePaintStyle, normalizeGlowStyle, normalizePaintStyle } from '@/utils/objectPaint';

describe('normalizePaintStyle', () => {
  it('falls back to a legacy solid color', () => {
    expect(normalizePaintStyle(undefined, '#123456')).toEqual({ type: 'solid', color: '#123456' });
  });

  it('sorts, clamps and separates gradient stops', () => {
    const result = normalizePaintStyle({
      type: 'linear',
      angle: 450,
      stops: [
        { id: 'b', offset: 2, color: '#ffffff' },
        { id: 'a', offset: -1, color: '#000000' },
      ],
    }, '#f00');
    expect(result.type).toBe('linear');
    if (result.type !== 'linear') throw new Error('expected linear');
    expect(result.angle).toBe(90);
    expect(result.stops.map(stop => stop.offset)).toEqual([0, 1]);
  });

  it('deep clones stops', () => {
    const source = { type: 'linear' as const, angle: 0, stops: [
      { id: 'a', offset: 0, color: '#000' },
      { id: 'b', offset: 1, color: '#fff' },
    ] };
    const clone = clonePaintStyle(source);
    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    if (clone.type === 'linear') expect(clone.stops).not.toBe(source.stops);
  });
});

describe('normalizeGlowStyle', () => {
  it('bounds expensive glow values', () => {
    expect(normalizeGlowStyle({
      enabled: true, color: '#0ff', blur: 999, opacity: 2, intensity: 9,
    })).toEqual({ enabled: true, color: '#0ff', blur: 120, opacity: 1, intensity: 3 });
  });
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- tests/objectPaint.test.ts`

Expected: FAIL because `utils/objectPaint.ts` and the new exported types do not exist.

- [ ] **Step 4: Add types and the minimal normalization implementation**

Add to `types/index.ts`:

```ts
export interface GradientStop { id: string; offset: number; color: string }
export type PaintStyle =
  | { type: 'solid'; color: string }
  | { type: 'linear'; angle: number; stops: GradientStop[] }
  | { type: 'radial'; centerX: number; centerY: number; radius: number; stops: GradientStop[] };
export interface GlowStyle {
  enabled: boolean;
  color: string;
  blur: number;
  opacity: number;
  intensity: number;
}
export interface GradientPreset { id: string; name: string; style: PaintStyle; builtIn?: boolean }
```

Implement pure clamps, stop sorting, fallback to `{ type: 'solid', color:
fallbackColor }`, normalized angle `0..359`, radial center `0..1`, radius
`0.05..2`, blur `0..120`, opacity `0..1`, intensity integer `1..3`, and deep
cloning in `utils/objectPaint.ts`.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- tests/objectPaint.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts types/index.ts utils/objectPaint.ts tests/objectPaint.test.ts
git commit -m "feat: add vector paint style model"
```

### Task 2: Gradient Coordinates, Canvas Paints, and Preset Persistence

**Files:**
- Modify: `utils/objectPaint.ts`
- Create: `utils/gradientPresets.ts`
- Create: `tests/objectPaintCoordinates.test.ts`
- Create: `tests/gradientPresets.test.ts`

**Interfaces:**
- Consumes: `PaintStyle`, `GradientPreset`.
- Produces: `getLinearGradientPoints(angle, bounds)`, `createCanvasPaint(ctx, style, bounds)`, `toKonvaPaintProps(style, bounds, channel)`.
- Produces: `BUILT_IN_GRADIENTS`, `loadGradientPresets(storage)`, `saveGradientPreset(storage, presets, name, style)`, `renameGradientPreset`, `deleteGradientPreset`.

- [ ] **Step 1: Write failing coordinate and preset tests**

Test that angle `0` runs left-to-right through the center, angle `90`
top-to-bottom, radial values scale from normalized coordinates, built-ins are
always present, corrupt JSON returns only built-ins, a duplicate name receives
`" (2)"`, and delete cannot remove a built-in.

```ts
expect(getLinearGradientPoints(0, { x: -50, y: -25, width: 100, height: 50 }))
  .toEqual({ start: { x: -50, y: 0 }, end: { x: 50, y: 0 } });
expect(saveGradientPreset(storage, [], 'Неон', style)[0].name).toBe('Неон');
expect(saveGradientPreset(storage, [{ id: '1', name: 'Неон', style }], 'Неон', style)[1].name)
  .toBe('Неон (2)');
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/objectPaintCoordinates.test.ts tests/gradientPresets.test.ts
```

Expected: FAIL because the functions do not exist.

- [ ] **Step 3: Implement shared coordinates and preset storage**

Use a `StorageLike` interface with `getItem`/`setItem` so tests use an in-memory
implementation. Store only custom presets in localStorage; merge them after the
immutable built-in list. Include built-ins: Манга, Закат, Океан, Конфета,
Огонь, Киберпанк, Золото.

`toKonvaPaintProps` must return concrete props for either `fill` or `stroke`.
For a radial stroke, convert to a linear paint using its first-to-last stops
and angle `0`. `createCanvasPaint` must call `ctx.createLinearGradient` or
`ctx.createRadialGradient` with the same coordinates and color stops.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- tests/objectPaintCoordinates.test.ts tests/gradientPresets.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/objectPaint.ts utils/gradientPresets.ts tests/objectPaintCoordinates.test.ts tests/gradientPresets.test.ts
git commit -m "feat: add shared gradients and preset persistence"
```

### Task 3: Bubble and Pointer Geometry

**Files:**
- Modify: `types/index.ts`
- Modify: `utils/bubbleGeometry.ts`
- Create: `utils/shapeGeometry.ts`
- Create: `tests/bubbleGeometryKinds.test.ts`
- Create: `tests/shapeGeometry.test.ts`

**Interfaces:**
- Extends `BubbleKind` with `'soft' | 'cloud' | 'comic' | 'electric' | 'caption'`.
- Extends `ShapeKind` with `'double-arrow' | 'curved-arrow' | 'elbow-arrow' | 'block-arrow' | 'chevron' | 'pointer'`.
- Produces: `getShapeGeometry(kind, width, height, curve): { strokePath?: string; fillPath?: string }`.

- [ ] **Step 1: Write failing geometry tests**

For every new bubble kind, assert `getBubblePath` returns a closed non-empty SVG
path without `NaN` at wide, tall, and minimum sizes. For every new pointer,
assert required stroke/fill paths exist, contain no invalid number, and react
to width/height; for `curved-arrow`, assert different `curve` values change the
path.

```ts
for (const kind of ['soft', 'cloud', 'comic', 'electric', 'caption'] as const) {
  const path = getBubblePath(kind, params);
  expect(path.length).toBeGreaterThan(20);
  expect(path).not.toMatch(/NaN|Infinity/);
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/bubbleGeometryKinds.test.ts tests/shapeGeometry.test.ts`

Expected: FAIL because the type unions and geometry branches do not exist.

- [ ] **Step 3: Implement deterministic geometry**

Extend `getBubblePath` without random values:

- `soft`: superellipse sampled into cubic/line segments;
- `cloud`: twelve deterministic lobes around an ellipse;
- `comic`: rounded rectangle merged with the existing tail;
- `electric`: alternating angular offsets around an ellipse;
- `caption`: slanted quadrilateral with a small corner radius and no tail.

Implement pointer geometry:

- open stroke paths for straight/double/curved/elbow arrows;
- closed fill paths for block arrow, chevron, pointer;
- explicit closed arrowhead subpaths where required.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- tests/bubbleGeometryKinds.test.ts tests/shapeGeometry.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add types/index.ts utils/bubbleGeometry.ts utils/shapeGeometry.ts tests/bubbleGeometryKinds.test.ts tests/shapeGeometry.test.ts
git commit -m "feat: add decorative bubble and pointer geometry"
```

### Task 4: Object Migration, History Safety, and Shape Settings

**Files:**
- Modify: `types/index.ts`
- Modify: `utils/coordinates.ts`
- Modify: `utils/fragmentClipboard.ts`
- Modify: `store/useStore.ts`
- Create: `tests/objectStyleMigration.test.ts`
- Create: `tests/objectStyleClone.test.ts`

**Interfaces:**
- Adds optional `fillStyle`, `strokeStyle`, `glow` to bubbles and shapes.
- Adds optional `lineStyle`, `curve` to shapes.
- Extends `ShapeSettings` with the same style defaults.
- Produces: `cloneShapeObjectStyle(shape)`, `cloneBubbleObjectStyle(bubble)` or an equivalent shared deep-clone helper used by snapshots and clipboard.

- [ ] **Step 1: Write failing migration and clone tests**

Assert a legacy shape/bubble becomes a solid style from its string color,
invalid gradient fields are clamped, unknown kinds are rejected safely, and
editing a current gradient stop does not mutate a history snapshot or copied
fragment.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/objectStyleMigration.test.ts tests/objectStyleClone.test.ts
```

Expected: FAIL because new fields are not sanitized or deeply cloned.

- [ ] **Step 3: Implement fields, sanitizer, defaults, and deep copies**

Use defaults:

```ts
fillStyle: { type: 'solid', color: '#ffffff' },
strokeStyle: { type: 'solid', color: '#000000' },
glow: { enabled: false, color: '#00e5ff', blur: 24, opacity: 0.8, intensity: 1 },
lineStyle: 'solid',
curve: 0.35,
```

Keep legacy `fill`/`stroke` synchronized when a solid paint is selected so
older clipboard readers remain useful. Snapshot and fragment copying must deep
clone every stop array.

- [ ] **Step 4: Run tests and store regressions**

Run:

```bash
npm test -- tests/objectStyleMigration.test.ts tests/objectStyleClone.test.ts
npm test
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add types/index.ts utils/coordinates.ts utils/fragmentClipboard.ts store/useStore.ts tests/objectStyleMigration.test.ts tests/objectStyleClone.test.ts
git commit -m "feat: persist vector styles safely"
```

### Task 5: Shared Paint Editor and Saved Gradient UI

**Files:**
- Create: `components/editor/panels/PaintEditor.tsx`
- Create: `tests/PaintEditor.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `PaintStyle`, `GlowStyle`, preset helpers.
- Produces React props:

```ts
interface PaintEditorProps {
  label: string;
  value: PaintStyle;
  glow?: GlowStyle;
  allowRadial?: boolean;
  onGestureStart?: () => void;
  onChange: (paint: PaintStyle) => void;
  onGlowChange?: (glow: GlowStyle) => void;
}
```

- [ ] **Step 1: Write failing component tests**

Render the editor and verify:

- switching from solid to linear creates two stops;
- changing a stop color calls `onChange`;
- clicking the gradient bar adds a stop;
- delete is disabled at two stops;
- saving asks for a name and writes a custom preset;
- clicking a saved preset applies a cloned style;
- neon toggle calls `onGlowChange`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/PaintEditor.test.tsx`

Expected: FAIL because `PaintEditor` does not exist.

- [ ] **Step 3: Implement the component**

Use native buttons, color inputs, ranges, and a CSS gradient preview. Stop drag
uses pointer capture on the stop element; call `onGestureStart` only once per
pointer gesture and call `onChange` during movement. Persist custom presets
through `gradientPresets.ts`; show rename/delete only for custom cards.

- [ ] **Step 4: Run tests and accessibility checks**

Run:

```bash
npm test -- tests/PaintEditor.test.tsx
npx tsc --noEmit
```

Expected: PASS with controls queryable by accessible names.

- [ ] **Step 5: Commit**

```bash
git add components/editor/panels/PaintEditor.tsx tests/PaintEditor.test.tsx app/globals.css
git commit -m "feat: add gradient and neon editor"
```

### Task 6: Bubble Gallery, Preview Rendering, and Free Transform

**Files:**
- Modify: `components/editor/panels/BubblePanel.tsx`
- Modify: `components/editor/BubbleNode.tsx`
- Create: `components/editor/PaintedShape.tsx`
- Create: `tests/bubblePresets.test.ts`

**Interfaces:**
- Consumes: shared geometry and paint helpers.
- Produces: classic/decorative bubble preset definitions and `PaintedShape` for a styled Konva path.

- [ ] **Step 1: Write failing preset tests**

Extract bubble preset definitions to an exported constant and assert all ten
kinds appear exactly once, decorative labels are present, narration/caption
default to no tail, and new bubbles carry cloned default styles.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/bubblePresets.test.ts`

Expected: FAIL because only five presets exist.

- [ ] **Step 3: Implement gallery and rendering**

Split cards into «Классические» and «Декоративные». Use `PaintEditor` for fill
and stroke and a shared glow control. Apply changes to selected bubble; without
selection, cards create a styled bubble and select it.

Render fill/stroke gradient props on the body and thought circles. Render glow
as non-listening backdrop paths/circles. Keep the current eight-anchor
Transformer with `keepRatio={false}` and current tail handle behavior.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/bubblePresets.test.ts
npm test
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/editor/panels/BubblePanel.tsx components/editor/BubbleNode.tsx components/editor/PaintedShape.tsx tests/bubblePresets.test.ts
git commit -m "feat: add styled decorative bubbles"
```

### Task 7: Pointer Gallery, Curve Handle, and Shape Editing

**Files:**
- Modify: `components/editor/panels/InsertPanel.tsx`
- Modify: `components/editor/CanvasArea.tsx`
- Modify: `components/editor/RightPanel.tsx`
- Create: `utils/shapePresets.ts`
- Create: `tests/shapePresets.test.ts`

**Interfaces:**
- Consumes: `getShapeGeometry`, `PaintEditor`, paint helpers.
- Produces: `SHAPE_PRESETS`, `POINTER_PRESETS`.

- [ ] **Step 1: Write failing preset tests**

Assert the gallery exposes the five existing shapes and seven pointer kinds,
line-only objects default to transparent fill, closed pointers default to the
current fill, and every created object has `keepRatio=false` compatible
non-zero width/height.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/shapePresets.test.ts`

Expected: FAIL because `shapePresets.ts` does not exist.

- [ ] **Step 3: Implement presets, selected-object editing, and renderer**

Move gallery definitions to `shapePresets.ts`. In `InsertPanel`, when
`selectedObject.type === 'shape'`, edit that object; otherwise update defaults
for the next object. Add PaintEditor, line style buttons, and pointer cards.

In `ShapeNode`, render geometry paths inside a group, attach the Transformer to
the group, set `keepRatio={false}`, and normalize scale into width/height at
transform end. Add a draggable curve handle only for `curved-arrow`; call
`onBeforeChange` once at drag start and update `curve` live.

Use Russian names for every new kind in `RightPanel`.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/shapePresets.test.ts
npm test
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/editor/panels/InsertPanel.tsx components/editor/CanvasArea.tsx components/editor/RightPanel.tsx utils/shapePresets.ts tests/shapePresets.test.ts
git commit -m "feat: add transformable pointer library"
```

### Task 8: Export Parity and Full Verification

**Files:**
- Modify: `components/editor/ExportModal.tsx`
- Create: `utils/drawVectorObject.ts`
- Create: `tests/drawVectorObject.test.ts`

**Interfaces:**
- Consumes: `createCanvasPaint`, normalized glow, bubble/shape geometry.
- Produces: `drawBubbleToContext(ctx, bubble, docWidth, docHeight)`, `drawShapeToContext(ctx, shape, docWidth, docHeight)`.

- [ ] **Step 1: Write failing renderer tests**

Use a recording Canvas context to assert linear/radial gradient calls use the
expected coordinates, glow saves/restores context, dashed/dotted line styles
set the expected dash arrays, and every new kind reaches fill/stroke without
throwing.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/drawVectorObject.test.ts`

Expected: FAIL because the shared export renderer does not exist.

- [ ] **Step 3: Implement and integrate the renderer**

Move shape/bubble Canvas 2D drawing out of `ExportModal` into
`drawVectorObject.ts`. Draw glow passes before the normal pass, reset shadow
and line dash between objects, and use the exact shared local bounds used by
Konva. Keep existing text layout and layer order.

- [ ] **Step 4: Run automated verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all commands exit `0`. If lint reports pre-existing warnings, record
them separately and ensure no new errors are introduced.

- [ ] **Step 5: Browser smoke**

Run the app and verify:

1. Create all ten bubble kinds and all seven pointer kinds.
2. Drag, rotate, resize from side and corner handles.
3. Change solid/linear/radial styles and neon.
4. Save, apply, rename, delete a custom gradient; reload and confirm persistence.
5. Undo one transform and one gradient gesture.
6. Export PNG and compare bubble/pointer shape, gradient direction, dash, and glow.
7. Open a legacy document or create an object with only `fill`/`stroke`; verify unchanged rendering.

- [ ] **Step 6: Commit**

```bash
git add components/editor/ExportModal.tsx utils/drawVectorObject.ts tests/drawVectorObject.test.ts
git commit -m "feat: match vector preview and export"
```
