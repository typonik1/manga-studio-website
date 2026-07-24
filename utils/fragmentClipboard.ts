import { useStore } from '@/store/useStore';
import {
  buildCleanupMask,
  buildCleanupSourceCanvas,
  computeAlphaBBox,
} from './cleanupRaster';
import { hasActiveSelection } from './layerActions';
import type { CropRect } from '@/types';

/**
 * Ctrl+C / Ctrl+V for selections.
 *
 * Ctrl+C with an active selection copies ONLY the selected fragment
 * (cropped to its bounding box, mask applied) — not the whole page:
 *  - into an internal clipboard (used for Ctrl+V inside the editor), and
 *  - into the system clipboard as PNG + an HTML marker (best effort), so the
 *    fragment can also be pasted into external apps. The marker lives in
 *    text/html (a span with a data attribute, Figma-style), so pasting into
 *    plain text fields never inserts marker garbage.
 *
 * Ctrl+V checks the internal clipboard first: if the paste corresponds to a
 * fragment copied here, it is inserted as a NEW LAYER at its original spot
 * (cropped to the fragment bounds, so the transform box hugs the fragment).
 * Unrelated images from the system clipboard keep the old behaviour and are
 * added as new pages.
 */

const MARKER_PREFIX = 'manga-studio-fragment:';
/** When the system clipboard could not be written, trust the internal
 *  clipboard for pastes made within this window after the copy. */
const INTERNAL_FALLBACK_TTL_MS = 10 * 60 * 1000;

export interface CopiedFragment {
  /** Fragment bitmap, cropped to the selection's bounding box (device px). */
  canvas: HTMLCanvasElement;
  /** Pixel size of the source document (to preserve physical size cross-page). */
  sourceDocWidth: number;
  sourceDocHeight: number;
  /** Selection bounding box, normalized to the source document. */
  bbox: CropRect;
  /** Marker token embedded into the system clipboard's text/html flavor. */
  token: string;
  /** Whether writing to the system clipboard succeeded. */
  systemWriteOk: boolean;
  copiedAt: number;
}

let current: CopiedFragment | null = null;

export function getCopiedFragment(): CopiedFragment | null {
  return current;
}

/** Decide whether this paste event should insert the copied fragment. */
export function shouldPasteFragment(data: DataTransfer): boolean {
  if (!current) return false;
  // Marker survives inside the text/html flavor (browsers keep the span's
  // data attribute through clipboard sanitization).
  const html = data.getData('text/html');
  if (html && html.includes(current.token)) return true;
  // The system clipboard could not be written on copy — the OS clipboard
  // still holds stale content, so a quick Ctrl+C → Ctrl+V means "paste the
  // fragment", not "paste whatever happened to be in the clipboard before".
  if (!current.systemWriteOk && Date.now() - current.copiedAt < INTERNAL_FALLBACK_TTL_MS) return true;
  return false;
}

/**
 * Copy the current selection's fragment. Returns an error string on failure,
 * null on success.
 */
export async function copySelectionFragment(): Promise<string | null> {
  const store = useStore.getState();
  const doc = store.documents[store.activeDocIndex];
  if (!doc) return 'Нет активного изображения.';
  if (!hasActiveSelection(doc)) return 'Сначала создайте выделение.';

  const mask = await buildCleanupMask(doc);
  if (mask.isEmpty) return 'Сначала создайте выделение.';
  const bboxPx = computeAlphaBBox(mask.canvas);
  if (!bboxPx) return 'Выделение пустое.';

  // Full composite (all visible raster layers, adjustments, z-order applied),
  // masked down to the selection.
  const source = await buildCleanupSourceCanvas(doc);
  const masked = document.createElement('canvas');
  masked.width = source.width;
  masked.height = source.height;
  const maskedCtx = masked.getContext('2d')!;
  maskedCtx.drawImage(source, 0, 0);
  maskedCtx.globalCompositeOperation = 'destination-in';
  maskedCtx.drawImage(mask.canvas, 0, 0, masked.width, masked.height);
  maskedCtx.globalCompositeOperation = 'source-over';

  // Crop to the selection's bounding box.
  const cropped = document.createElement('canvas');
  cropped.width = bboxPx.width;
  cropped.height = bboxPx.height;
  cropped.getContext('2d')!.drawImage(masked, -bboxPx.x, -bboxPx.y);

  const token = `${MARKER_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  // Best effort: also put the fragment into the system clipboard (PNG + HTML
  // marker) so Ctrl+V works naturally and the fragment can be pasted into
  // other apps as an image. No text/plain flavor — pasting into text fields
  // must not insert marker garbage.
  let systemWriteOk = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      const blob = await new Promise<Blob>((resolve, reject) => {
        cropped.toBlob(result => (result ? resolve(result) : reject(new Error('toBlob failed'))), 'image/png');
      });
      const markerHtml = `<span data-manga-studio-fragment="${token}"></span>`;
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
          'text/html': new Blob([markerHtml], { type: 'text/html' }),
        }),
      ]);
      systemWriteOk = true;
    }
  } catch {
    systemWriteOk = false;
  }

  current = {
    canvas: cropped,
    sourceDocWidth: doc.width,
    sourceDocHeight: doc.height,
    bbox: {
      x: bboxPx.x / doc.width,
      y: bboxPx.y / doc.height,
      width: bboxPx.width / doc.width,
      height: bboxPx.height / doc.height,
    },
    token,
    systemWriteOk,
    copiedAt: Date.now(),
  };
  return null;
}

/**
 * Paste the copied fragment as a new raster layer of the active document.
 * Same page → exact original position; another page → centered, preserving
 * pixel size (downscaled only if it doesn't fit). Returns an error string on
 * failure, null on success.
 */
export async function pasteFragmentAsLayer(): Promise<string | null> {
  const fragment = current;
  if (!fragment) return 'Буфер обмена пуст.';
  const store = useStore.getState();
  const doc = store.documents[store.activeDocIndex];
  if (!doc) return 'Нет активного изображения.';

  const W = doc.width;
  const H = doc.height;
  let drawW = fragment.canvas.width;
  let drawH = fragment.canvas.height;
  let drawX: number;
  let drawY: number;
  if (fragment.sourceDocWidth === W && fragment.sourceDocHeight === H) {
    // Same-size document (typically the same page): paste in place.
    drawX = fragment.bbox.x * W;
    drawY = fragment.bbox.y * H;
  } else {
    // Different page: keep physical pixel size, center, downscale to fit.
    const fit = Math.min(1, (W * 0.95) / drawW, (H * 0.95) / drawH);
    drawW *= fit;
    drawH *= fit;
    drawX = (W - drawW) / 2;
    drawY = (H - drawH) / 2;
  }

  // Full-document-size layer with the fragment at its spot + a crop that hugs
  // the fragment, so the transformer frames the fragment, not the whole page.
  const full = document.createElement('canvas');
  full.width = W;
  full.height = H;
  full.getContext('2d')!.drawImage(fragment.canvas, drawX, drawY, drawW, drawH);

  const count = doc.aiLayers.filter(layer => layer.name.startsWith('Фрагмент')).length + 1;
  store.addAiLayer(doc.id, {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `Фрагмент ${count}`,
    src: full.toDataURL('image/png'),
    visible: true,
    opacity: 1,
    operation: 'drawing',
    locked: false,
    eraseElements: [],
    crop: {
      x: drawX / W,
      y: drawY / H,
      width: drawW / W,
      height: drawH / H,
    },
  });
  return null;
}
