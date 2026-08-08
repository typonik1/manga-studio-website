import Konva from 'konva';
import type { TextConfig } from 'konva/lib/shapes/Text';
import type { ExportSettings, TextObject } from '@/types';

/**
 * Text coordinates/font size/width are normalized to the source document.
 * Stroke and shadow sizes are stored in source-document pixels, so previews
 * scale them by the same factor as the image.
 */
export function createTextNodeConfig(
  text: TextObject,
  documentWidth: number,
  documentHeight: number,
  outputScale = 1,
): TextConfig {
  const safeScale = Number.isFinite(outputScale) && outputScale > 0 ? outputScale : 1;
  const width = Math.max(1, documentWidth * safeScale);
  const height = Math.max(1, documentHeight * safeScale);

  return {
    x: text.x * width,
    y: text.y * height,
    text: text.text,
    fontFamily: text.fontFamily,
    fontSize: text.fontSize * height,
    fill: text.fill,
    stroke: text.stroke || undefined,
    strokeWidth: text.stroke ? text.strokeWidth * safeScale : 0,
    shadowColor: text.shadowBlur > 0 ? text.shadowColor : undefined,
    shadowBlur: text.shadowBlur * safeScale,
    lineHeight: text.lineHeight,
    align: text.align,
    verticalAlign: 'top',
    wrap: 'word',
    width: text.width * width,
    scaleX: text.scaleX,
    scaleY: text.scaleY,
    rotation: text.rotation,
  };
}

/** Draw with Konva itself so export uses the same wrapping/baseline metrics as preview. */
export function renderTextObjectToContext(
  context: CanvasRenderingContext2D,
  text: TextObject,
  documentWidth: number,
  documentHeight: number,
): void {
  if (!text.visible || !text.text) return;
  const node = new Konva.Text(createTextNodeConfig(text, documentWidth, documentHeight));
  const bounds = node.getClientRect();
  const x = Math.floor(bounds.x);
  const y = Math.floor(bounds.y);
  const width = Math.max(1, Math.ceil(bounds.x + bounds.width) - x);
  const height = Math.max(1, Math.ceil(bounds.y + bounds.height) - y);
  const canvas = node.toCanvas({ x, y, width, height, pixelRatio: 1 });
  context.drawImage(canvas, x, y);
  node.destroy();
}

export function initializeExportCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  format: ExportSettings['format'],
): void {
  if (format !== 'jpg') return;
  context.save?.();
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.restore?.();
}
