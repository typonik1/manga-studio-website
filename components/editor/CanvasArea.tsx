'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Text, Transformer, Group, Rect, Ellipse, Arrow, Star, Circle } from 'react-konva';
import Konva from 'konva';
import { useStore } from '@/store/useStore';
import { uid } from '@/utils/imageUtils';
import type { AiRasterLayer, ImageDocument, MaskElement, StrokeData, WatermarkObject, TextObject, ShapeObject, CropRect, BubbleObject, PerspectiveQuad } from '@/types';
import { resolveLayerOrder } from '@/utils/layerOrder';
import { buildBaseCanvas, buildRasterLayerCanvas, createFloodMask, bakeStrokeIntoLayerSrc } from '@/utils/cleanupRaster';
import { DropZone } from './DropZone';
import { LayerContextMenu, type ContextMenuState } from './LayerContextMenu';
import { ToolOptionsBar } from './ToolOptionsBar';
import { screenToImage } from '@/utils/coordinates';
import { loadImagesFromFiles } from '@/utils/imageUtils';
import { createLayerFromSelection, hasActiveSelection } from '@/utils/layerActions';
import { BubbleNode } from './BubbleNode';
import { InlineTextEditor } from './InlineTextEditor';
import { drawBrushStroke } from '@/utils/brushRaster';
import { clonePerspectiveQuad, drawPerspectiveImage, isValidPerspectiveQuad } from '@/utils/perspective';

const MAX_PREVIEW_SIDE = 1800;

function scaleToFit(w: number, h: number, maxSide: number): number {
  return Math.min(1, maxSide / Math.max(w, h));
}

function useImage(src: string | null | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) { setImg(null); return; }
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => setImg(image);
    image.src = src;
    return () => { image.onload = null; };
  }, [src]);
  return img;
}

function makeCheckerPattern(): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 16;
  const ctx = tile.getContext('2d')!;
  ctx.fillStyle = '#3a3a42';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillRect(8, 8, 8, 8);
  return tile;
}

/**
 * Renders committed cleanup brush strokes to an offscreen canvas so that
 * erase-mode strokes (destination-out) only affect the strokes themselves
 * and never punch holes through the layers rendered below.
 */
function CleanupStrokesNode({ strokes, width, height, lineScale }: {
  strokes: StrokeData[];
  width: number;
  height: number;
  lineScale: number;
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!strokes.length) { setCanvas(null); return; }
    const next = document.createElement('canvas');
    next.width = Math.max(1, Math.round(width));
    next.height = Math.max(1, Math.round(height));
    const ctx = next.getContext('2d');
    if (!ctx) return;
    for (const stroke of strokes) {
      drawBrushStroke(ctx, { ...stroke, size: stroke.size * lineScale / height }, width, height);
    }
    setCanvas(next);
  }, [strokes, width, height, lineScale]);

  if (!canvas) return null;
  return <KonvaImage image={canvas} listening={false} />;
}

/** Shared placement/transform values for a raster layer node. */
interface RasterNodePlacement {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  crop?: CropRect | null;
  perspective?: PerspectiveQuad | null;
}

const PERSPECTIVE_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

function PerspectiveHandles({ quad, width, height, onBeforeChange, onChange }: {
  quad: PerspectiveQuad;
  width: number;
  height: number;
  onBeforeChange: () => void;
  onChange: (quad: PerspectiveQuad) => void;
}) {
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<PerspectiveQuad | null>(null);
  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const flush = () => {
    frameRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) onChange(pending);
  };
  const schedule = (next: PerspectiveQuad) => {
    pendingRef.current = next;
    if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flush);
  };
  const linePoints = PERSPECTIVE_KEYS.flatMap(key => [quad[key].x * width, quad[key].y * height]);

  return (
    <>
      <Line points={linePoints} closed stroke="#5e9fe8" strokeWidth={2} dash={[7, 4]} listening={false} />
      {PERSPECTIVE_KEYS.map(key => {
        const point = quad[key];
        return (
          <Circle
            key={key}
            x={point.x * width}
            y={point.y * height}
            radius={7}
            fill="#ffffff"
            stroke="#5e9fe8"
            strokeWidth={2}
            draggable
            onDragStart={onBeforeChange}
            onDragMove={event => {
              const next = clonePerspectiveQuad(quad)!;
              next[key] = { x: event.target.x() / width, y: event.target.y() / height };
              if (!isValidPerspectiveQuad(next)) {
                event.target.position({ x: point.x * width, y: point.y * height });
                return;
              }
              schedule(next);
            }}
            onDragEnd={event => {
              const next = clonePerspectiveQuad(quad)!;
              next[key] = { x: event.target.x() / width, y: event.target.y() / height };
              if (isValidPerspectiveQuad(next)) {
                if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
                pendingRef.current = null;
                onChange(next);
              }
            }}
          />
        );
      })}
    </>
  );
}

/**
 * Wraps a raster image with its non-destructive transform + crop and, when
 * selected with the select tool and unlocked, makes it draggable/transformable.
 */
function PlacedRasterImage({ nodeName, image, width, height, opacity, placement, interactive, isSelected, onSelect, onContextMenu, onBeforeChange, onChange }: {
  nodeName: string;
  image: CanvasImageSource;
  width: number;
  height: number;
  opacity: number;
  placement: RasterNodePlacement;
  interactive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => void;
  onBeforeChange: () => void;
  onChange: (updates: { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number; perspective?: PerspectiveQuad | null }) => void;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [perspectiveCanvas, setPerspectiveCanvas] = useState<HTMLCanvasElement | null>(null);
  const draggable = interactive && isSelected;

  useEffect(() => {
    if (draggable && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [draggable]);

  const crop = placement.crop ?? null;
  const perspective = placement.perspective && isValidPerspectiveQuad(placement.perspective) ? placement.perspective : null;
  const naturalW = (image as HTMLImageElement).naturalWidth || (image as HTMLCanvasElement).width || width;
  const naturalH = (image as HTMLImageElement).naturalHeight || (image as HTMLCanvasElement).height || height;

  useEffect(() => {
    if (!perspective) { setPerspectiveCanvas(null); return; }
    const next = document.createElement('canvas');
    next.width = Math.max(1, Math.round(width));
    next.height = Math.max(1, Math.round(height));
    const ctx = next.getContext('2d');
    if (!ctx) return;
    drawPerspectiveImage(ctx, image, perspective, next.width, next.height, { crop, opacity, subdivisions: 12 });
    setPerspectiveCanvas(next);
  }, [image, width, height, opacity, crop, perspective]);

  if (perspective) {
    return (
      <>
        {perspectiveCanvas && (
          <KonvaImage
            name={nodeName}
            image={perspectiveCanvas}
            width={width}
            height={height}
            listening={interactive}
            onClick={onSelect}
            onTap={onSelect}
            onContextMenu={onContextMenu}
          />
        )}
        {draggable && (
          <PerspectiveHandles
            quad={perspective}
            width={width}
            height={height}
            onBeforeChange={onBeforeChange}
            onChange={next => onChange({ perspective: next })}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Group
        ref={groupRef}
        x={(placement.x ?? 0) * width}
        y={(placement.y ?? 0) * height}
        scaleX={placement.scaleX ?? 1}
        scaleY={placement.scaleY ?? 1}
        rotation={placement.rotation ?? 0}
        draggable={draggable}
        listening={interactive}
        onClick={onSelect}
        onTap={onSelect}
        onContextMenu={onContextMenu}
        onDragStart={onBeforeChange}
        onDragEnd={e => onChange({ x: e.target.x() / width, y: e.target.y() / height })}
        onTransformStart={onBeforeChange}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          onChange({
            x: node.x() / width,
            y: node.y() / height,
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
            rotation: node.rotation(),
          });
        }}
      >
        {crop ? (
          <KonvaImage
            name={nodeName}
            image={image}
            x={crop.x * width}
            y={crop.y * height}
            width={crop.width * width}
            height={crop.height * height}
            crop={{ x: crop.x * naturalW, y: crop.y * naturalH, width: crop.width * naturalW, height: crop.height * naturalH }}
            opacity={opacity}
          />
        ) : (
          <KonvaImage name={nodeName} image={image} width={width} height={height} opacity={opacity} />
        )}
      </Group>
      {draggable && (
        <Transformer
          ref={trRef}
          rotateEnabled
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 5 || newBox.height < 5 ? oldBox : newBox)}
        />
      )}
    </>
  );
}

function RasterLayerNode({ layer, width, height, interactive, isSelected, onSelect, onContextMenu }: {
  layer: AiRasterLayer;
  width: number;
  height: number;
  interactive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => void;
}) {
  const { updateAiLayer, pushHistory } = useStore();
  const adjustments = layer.adjustments;
  const needsProcessing = Boolean(
    (layer.eraseElements?.length ?? 0) > 0 ||
    (adjustments && (adjustments.brightness !== 1 || adjustments.contrast !== 1 || adjustments.saturation !== 1))
  );
  const plainImage = useImage(needsProcessing ? null : layer.src);
  const [erased, setErased] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!needsProcessing) { setErased(null); return; }
    let cancelled = false;
    void buildRasterLayerCanvas(layer, Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))
      .then(canvas => { if (!cancelled) setErased(canvas); })
      .catch(() => { if (!cancelled) setErased(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.src, layer.eraseElements, adjustments, needsProcessing, width, height]);

  const image = needsProcessing ? erased : plainImage;
  if (!image) return null;
  return (
    <PlacedRasterImage
      nodeName={`ai-raster-layer ${layer.id}`}
      image={image}
      width={width}
      height={height}
      opacity={layer.opacity}
      placement={layer}
      interactive={interactive && layer.locked !== true}
      isSelected={isSelected}
      onSelect={onSelect}
      onContextMenu={onContextMenu}
      onBeforeChange={pushHistory}
      onChange={updates => updateAiLayer(layer.id, updates, { history: false })}
    />
  );
}

function BaseLayerNode({ doc, width, height, interactive, isSelected, onSelect, onContextMenu }: {
  doc: ImageDocument;
  width: number;
  height: number;
  interactive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => void;
}) {
  const { updateBaseLayer, pushHistory } = useStore();
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const adjustments = doc.baseLayer?.adjustments;
  const eraseElements = doc.baseLayer?.eraseElements;
  const needsProcessing = Boolean(
    (eraseElements?.length ?? 0) > 0 ||
    (adjustments && (adjustments.brightness !== 1 || adjustments.contrast !== 1 || adjustments.saturation !== 1))
  );
  const plainImage = useImage(needsProcessing ? null : (doc.cleanup.committed ?? doc.originalSrc));

  useEffect(() => {
    if (!needsProcessing) { setCanvas(null); return; }
    let cancelled = false;
    void buildBaseCanvas(doc)
      .then(result => { if (!cancelled) setCanvas(result); })
      .catch(() => { if (!cancelled) setCanvas(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.originalSrc, doc.cleanup.committed, adjustments, eraseElements, needsProcessing]);

  const image = needsProcessing ? canvas : plainImage;
  if (!image) return null;
  const state = doc.baseLayer;
  return (
    <PlacedRasterImage
      nodeName="base-image"
      image={image}
      width={width}
      height={height}
      opacity={state?.opacity ?? 1}
      placement={state ?? {}}
      interactive={interactive && state?.locked === false}
      isSelected={isSelected}
      onSelect={onSelect}
      onContextMenu={onContextMenu}
      onBeforeChange={pushHistory}
      onChange={updates => updateBaseLayer(updates, { history: false })}
    />
  );
}

function MaskOverlayNode({ elements, strokes, width, height, opacity }: { elements?: MaskElement[]; strokes: StrokeData[]; width: number; height: number; opacity: number }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = document.createElement('canvas');
      next.width = Math.max(1, Math.round(width)); next.height = Math.max(1, Math.round(height));
      const ctx = next.getContext('2d'); if (!ctx) return;
      const items = elements?.length ? elements : strokes.map(stroke => ({ type: 'brush', stroke }) as MaskElement);
      for (const element of items) {
        ctx.save(); ctx.fillStyle = ctx.strokeStyle = 'rgb(255, 128, 0)';
        if (element.type === 'brush') {
          drawBrushStroke(ctx, element.stroke, width, height, { color: 'rgb(255, 128, 0)' });
        } else if (element.type === 'polygon') {
          // 'erase' polygons must punch holes in the orange preview, matching buildCleanupMask.
          ctx.globalCompositeOperation = element.mode === 'erase' ? 'destination-out' : 'source-over';
          ctx.beginPath(); for (let index = 0; index < element.points.length; index += 2) { const x = element.points[index] * width, y = element.points[index + 1] * height; if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); ctx.fill();
        } else {
          const bitmap = new window.Image(); bitmap.crossOrigin = 'anonymous'; await new Promise<void>((resolve, reject) => { bitmap.onload = () => resolve(); bitmap.onerror = reject; bitmap.src = element.src; });
          const tinted = document.createElement('canvas'); tinted.width = next.width; tinted.height = next.height; const tintedCtx = tinted.getContext('2d')!;
          tintedCtx.drawImage(bitmap, 0, 0, next.width, next.height); tintedCtx.globalCompositeOperation = 'source-in'; tintedCtx.fillStyle = 'rgb(255, 128, 0)'; tintedCtx.fillRect(0, 0, next.width, next.height);
          // 'erase' bitmaps subtract from the preview instead of adding to it.
          ctx.globalCompositeOperation = element.mode === 'erase' ? 'destination-out' : 'source-over';
          ctx.drawImage(tinted, 0, 0);
        }
        ctx.restore();
      }
      if (!cancelled) setCanvas(next);
    })();
    return () => { cancelled = true; };
  }, [elements, strokes, width, height]);
  return canvas ? <KonvaImage image={canvas} width={width} height={height} opacity={opacity} listening={false} /> : null;
}

function WatermarkNode({
  wm,
  docWidth,
  docHeight,
  previewScale,
  isSelected,
  onSelect,
  onChange,
  onBeforeChange,
}: {
  wm: WatermarkObject;
  docWidth: number;
  docHeight: number;
  previewScale: number;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<WatermarkObject>) => void;
  onBeforeChange: () => void;
}) {
  const nodeRef = useRef<Konva.Text | Konva.Image | null>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const logoImg = useImage(wm.type === 'image' ? wm.imageSrc : null);

  useEffect(() => {
    if (isSelected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const pW = docWidth * previewScale;
  const pH = docHeight * previewScale;
  const x = wm.x * pW;
  const y = wm.y * pH;
  const opacity = wm.opacity;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange({ x: e.target.x() / pW, y: e.target.y() / pH });
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const node = nodeRef.current;
    if (!node) return;
    onChange({
      x: node.x() / pW,
      y: node.y() / pH,
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      rotation: node.rotation(),
    });
  };

  if (!wm.visible) return null;

  const commonProps = {
    x,
    y,
    scaleX: wm.scaleX,
    scaleY: wm.scaleY,
    rotation: wm.rotation,
    opacity,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragStart: onBeforeChange,
    onTransformStart: onBeforeChange,
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd,
    offsetX: 0,
    offsetY: 0,
  };

  // Keep the logo's natural aspect ratio — width is a fraction of doc width,
  // height is derived from the image itself so it never stretches.
  const logoW = (wm.imageWidth ?? 0.25) * pW;
  const logoH = logoImg && logoImg.naturalWidth > 0
    ? logoW * (logoImg.naturalHeight / logoImg.naturalWidth)
    : (wm.imageHeight ?? 0.12) * pH;

  return (
    <>
      {wm.type === 'text' ? (
        <Text
          {...commonProps}
          ref={nodeRef as React.RefObject<Konva.Text>}
          text={wm.text ?? ''}
          fontFamily={wm.fontFamily ?? 'Arial'}
          fontSize={(wm.fontSize ?? 0.06) * docHeight * previewScale}
          fill={wm.fill ?? '#ffffff'}
        />
      ) : logoImg ? (
        <KonvaImage
          {...commonProps}
          ref={nodeRef as React.RefObject<Konva.Image>}
          image={logoImg}
          width={logoW}
          height={logoH}
        />
      ) : null}
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
          rotateEnabled
          keepRatio
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        />
      )}
    </>
  );
}

function TextNode({
  txt,
  docWidth,
  docHeight,
  previewScale,
  isSelected,
  isEditing,
  onSelect,
  onChange,
  onBeforeChange,
  onEditRequest,
}: {
  txt: TextObject;
  docWidth: number;
  docHeight: number;
  previewScale: number;
  isSelected: boolean;
  /** While the inline editor is open, the Konva node is hidden to avoid a "ghost" copy under the textarea. */
  isEditing: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<TextObject>) => void;
  onBeforeChange: () => void;
  onEditRequest: () => void;
}) {
  const nodeRef = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && !isEditing && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, isEditing]);

  const pW = docWidth * previewScale;
  const pH = docHeight * previewScale;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange({ x: e.target.x() / pW, y: e.target.y() / pH });
  };

  const handleTransformEnd = () => {
    const node = nodeRef.current;
    if (!node) return;
    onChange({
      x: node.x() / pW,
      y: node.y() / pH,
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      rotation: node.rotation(),
    });
  };

  if (!txt.visible) return null;

  return (
    <>
      <Text
        ref={nodeRef}
        x={txt.x * pW}
        y={txt.y * pH}
        text={txt.text}
        fontFamily={txt.fontFamily}
        fontSize={txt.fontSize * pH}
        fill={txt.fill}
        stroke={txt.stroke || undefined}
        strokeWidth={txt.stroke ? txt.strokeWidth : 0}
        shadowColor={txt.shadowBlur > 0 ? txt.shadowColor : undefined}
        shadowBlur={txt.shadowBlur}
        lineHeight={txt.lineHeight}
        align={txt.align}
        width={txt.width * pW}
        scaleX={txt.scaleX}
        scaleY={txt.scaleY}
        rotation={txt.rotation}
        visible={!isEditing}
        listening={!isEditing}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onEditRequest}
        onDblTap={onEditRequest}
        onDragStart={onBeforeChange}
        onTransformStart={onBeforeChange}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
      {isSelected && !isEditing && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
          rotateEnabled
          keepRatio
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        />
      )}
    </>
  );
}

function ShapeNode({
  shape,
  docWidth,
  docHeight,
  previewScale,
  isSelected,
  onSelect,
  onChange,
  onBeforeChange,
}: {
  shape: ShapeObject;
  docWidth: number;
  docHeight: number;
  previewScale: number;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<ShapeObject>) => void;
  onBeforeChange: () => void;
}) {
  const nodeRef = useRef<Konva.Node>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const pW = docWidth * previewScale;
  const pH = docHeight * previewScale;
  const w = shape.width * pW;
  const h = shape.height * pH;
  const cx = shape.x * pW;
  const cy = shape.y * pH;
  const strokeW = shape.strokeWidth * previewScale;

  if (!shape.visible) return null;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange({ x: e.target.x() / pW, y: e.target.y() / pH });
  };

  const handleTransformEnd = () => {
    const node = nodeRef.current;
    if (!node) return;
    onChange({
      x: node.x() / pW,
      y: node.y() / pH,
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      rotation: node.rotation(),
    });
  };

  const common = {
    x: cx,
    y: cy,
    rotation: shape.rotation,
    scaleX: shape.scaleX,
    scaleY: shape.scaleY,
    opacity: shape.opacity,
    fill: shape.fill || undefined,
    stroke: shape.stroke || undefined,
    strokeWidth: strokeW,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragStart: onBeforeChange,
    onTransformStart: onBeforeChange,
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd,
  };

  let node: React.ReactNode = null;
  if (shape.kind === 'rect') {
    node = (
      <Rect
        {...common}
        ref={nodeRef as React.RefObject<Konva.Rect>}
        offsetX={w / 2}
        offsetY={h / 2}
        width={w}
        height={h}
        cornerRadius={shape.cornerRadius * previewScale}
      />
    );
  } else if (shape.kind === 'ellipse') {
    node = (
      <Ellipse
        {...common}
        ref={nodeRef as React.RefObject<Konva.Ellipse>}
        radiusX={w / 2}
        radiusY={h / 2}
      />
    );
  } else if (shape.kind === 'line') {
    node = (
      <Line
        {...common}
        ref={nodeRef as React.RefObject<Konva.Line>}
        points={[-w / 2, 0, w / 2, 0]}
        lineCap="round"
        hitStrokeWidth={Math.max(16, strokeW)}
      />
    );
  } else if (shape.kind === 'arrow') {
    node = (
      <Arrow
        {...common}
        ref={nodeRef as React.RefObject<Konva.Arrow>}
        points={[-w / 2, 0, w / 2, 0]}
        pointerLength={Math.max(8, strokeW * 3)}
        pointerWidth={Math.max(8, strokeW * 3)}
        fill={shape.stroke || '#000'}
        lineCap="round"
        hitStrokeWidth={Math.max(16, strokeW)}
      />
    );
  } else if (shape.kind === 'star') {
    node = (
      <Star
        {...common}
        ref={nodeRef as React.RefObject<Konva.Star>}
        numPoints={5}
        innerRadius={Math.min(w, h) / 4}
        outerRadius={Math.min(w, h) / 2}
      />
    );
  }

  return (
    <>
      {node}
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
          rotateEnabled
        />
      )}
    </>
  );
}

/** Crop overlay: darkens everything outside the crop rect; rect is draggable/resizable */
function CropOverlay({
  cropRect,
  imgW,
  imgH,
  onChange,
}: {
  cropRect: CropRect;
  imgW: number;
  imgH: number;
  onChange: (rect: CropRect) => void;
}) {
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, []);

  const rx = cropRect.x * imgW;
  const ry = cropRect.y * imgH;
  const rw = cropRect.width * imgW;
  const rh = cropRect.height * imgH;

  const clamp = (x: number, y: number, w: number, h: number): CropRect => {
    const cw = Math.max(0.02, Math.min(1, w / imgW));
    const ch = Math.max(0.02, Math.min(1, h / imgH));
    const cx = Math.max(0, Math.min(1 - cw, x / imgW));
    const cy = Math.max(0, Math.min(1 - ch, y / imgH));
    return { x: cx, y: cy, width: cw, height: ch };
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange(clamp(e.target.x(), e.target.y(), rw, rh));
  };

  const handleTransformEnd = () => {
    const node = rectRef.current;
    if (!node) return;
    const newW = node.width() * node.scaleX();
    const newH = node.height() * node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onChange(clamp(node.x(), node.y(), newW, newH));
  };

  return (
    <>
      {/* Dark veil outside the crop area (4 rects) */}
      <Rect x={0} y={0} width={imgW} height={ry} fill="rgba(0,0,0,0.6)" listening={false} />
      <Rect x={0} y={ry + rh} width={imgW} height={Math.max(0, imgH - ry - rh)} fill="rgba(0,0,0,0.6)" listening={false} />
      <Rect x={0} y={ry} width={rx} height={rh} fill="rgba(0,0,0,0.6)" listening={false} />
      <Rect x={rx + rw} y={ry} width={Math.max(0, imgW - rx - rw)} height={rh} fill="rgba(0,0,0,0.6)" listening={false} />
      {/* Crop rect */}
      <Rect
        ref={rectRef}
        x={rx}
        y={ry}
        width={rw}
        height={rh}
        stroke="#5e9fe8"
        strokeWidth={2}
        dash={[8, 4]}
        fill="rgba(94,159,232,0.05)"
        draggable
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
      <Transformer
        ref={trRef}
        rotateEnabled={false}
        keepRatio={false}
        boundBoxFunc={(oldBox, newBox) => {
          if (newBox.width < 20 || newBox.height < 20) return oldBox;
          return newBox;
        }}
      />
    </>
  );
}

export function CanvasArea() {
  const {
    documents, activeDocIndex, setActiveDoc,
    activeTool, cleanupSettings,
        addStroke, addMaskStroke, addMaskElement, addEraseElement, updateWatermark, updateText, updateShape, updateBubble,
    selectLayer, updateCleanupSettings,
    selectedObject, setSelectedObject,
    inlineEditingTextId, setInlineEditingTextId,
    textSettings, addText,
    layerVisibility,
    viewport, setViewport,
    addDocuments,
    pushHistory, setLeftTab,
    fontsVersion, cropRect, setCropRect, updateDocumentThumbnail,
    layerCropTarget, applyLayerCrop, cancelLayerCrop,
  } = useStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const isPainting = useRef(false);
  const currentStroke = useRef<number[]>([]);
  const strokeId = useRef<string>('');
  // Live stroke rendered imperatively (no React re-renders while drawing)
  const liveLineRef = useRef<Konva.Line>(null);
  const livePoints = useRef<number[]>([]);
  const pendingBrushPoints = useRef<number[]>([]);
  const brushFrameRef = useRef<number | null>(null);
  const lastBrushPointRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerTargetRef = useRef<HTMLElement | null>(null);
  const finishPointerRef = useRef<(() => void) | null>(null);
  const isLassoing = useRef(false);
  const lassoPoints = useRef<number[]>([]);
  const liveLassoRef = useRef<Konva.Line>(null);
  // Rectangular selection (rectSelect)
  const isRectSelecting = useRef(false);
  const rectStart = useRef({ x: 0, y: 0 });
  const rectCurrent = useRef({ x: 0, y: 0 });
  const liveRectRef = useRef<Konva.Rect>(null);
  // Tracks whether the currently-open inline text editor was just created (click-to-place)
  const isNewTextRef = useRef(false);
  // Brush cursor updated imperatively via DOM
  const cursorRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [wandPending, setWandPending] = useState<{ src: string; coverage: number } | null>(null);
  const [wandInfo, setWandInfo] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const checkerPattern = useRef<HTMLCanvasElement | null>(null);
  if (typeof document !== 'undefined' && !checkerPattern.current) checkerPattern.current = makeCheckerPattern();

  // Auto-hide the coverage info chip
  useEffect(() => {
    if (!wandInfo) return;
    const timer = window.setTimeout(() => setWandInfo(null), 2500);
    return () => window.clearTimeout(timer);
  }, [wandInfo]);

  const activeDoc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;
  const baseReplaced = activeDoc?.aiLayers.some(layer => layer.visible && layer.replacesBase) ?? false;

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Compute preview scale and stage offset
  const previewScale = activeDoc
    ? scaleToFit(activeDoc.width, activeDoc.height, MAX_PREVIEW_SIDE)
    : 1;
  const imgW = activeDoc ? activeDoc.width * previewScale : 0;
  const imgH = activeDoc ? activeDoc.height * previewScale : 0;

  // Fit to screen
  const fitToScreen = useCallback(() => {
    if (!activeDoc || containerSize.w === 0 || containerSize.h === 0) return;
    const scale = Math.min(
      (containerSize.w - 40) / imgW,
      (containerSize.h - 40) / imgH,
      1
    );
    const x = (containerSize.w - imgW * scale) / 2;
    const y = (containerSize.h - imgH * scale) / 2;
    setViewport({ x, y, scale });
  }, [activeDoc, containerSize, imgW, imgH, setViewport]);

  // Auto-fit on document change
  useEffect(() => { fitToScreen(); }, [activeDocIndex]);

  useEffect(() => () => {
    if (brushFrameRef.current !== null) window.cancelAnimationFrame(brushFrameRef.current);
  }, []);

  // ── Native pointermove for zero-lag brush cursor circle ──────────────────
  // Runs at the native pointer rate, never through React state or Konva.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: PointerEvent) => {
      const cursor = cursorRef.current;
      if (!cursor) return;
      const store = useStore.getState();
      const tool = store.activeTool;
      if (tool !== 'brush' && tool !== 'maskBrush' && tool !== 'eraser') {
        if (cursor.style.display !== 'none') cursor.style.display = 'none';
        return;
      }
      const rect = container.getBoundingClientRect();
      const posX = e.clientX - rect.left;
      const posY = e.clientY - rect.top;
      const doc = store.documents[store.activeDocIndex];
      const vp = store.viewport;
      const docH = doc?.height ?? 1000;
      const ps = doc ? Math.min(1, 1800 / Math.max(doc.width, doc.height)) : 1;
      const rad = (store.cleanupSettings.brushSize * docH * ps * vp.scale) / 2;
      const d = rad * 2;
      cursor.style.display = 'block';
      cursor.style.width = `${d}px`;
      cursor.style.height = `${d}px`;
      cursor.style.transform = `translate3d(${posX - rad}px, ${posY - rad}px, 0)`;
    };
    const leave = () => { if (cursorRef.current) cursorRef.current.style.display = 'none'; };
    container.addEventListener('pointermove', handler, { passive: true });
    container.addEventListener('pointerleave', leave, { passive: true });
    return () => {
      container.removeEventListener('pointermove', handler);
      container.removeEventListener('pointerleave', leave);
    };
  }, []);

  // Wheel zoom
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = viewport.scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const scaleFactor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newScale = Math.max(0.05, Math.min(8, oldScale * scaleFactor));
    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    };
    setViewport({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  // Pan with space+drag
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panVpStart = useRef({ x: 0, y: 0 });

  const flushBrushPreview = () => {
    brushFrameRef.current = null;
    const pending = pendingBrushPoints.current;
    if (!pending.length) return;
    for (let index = 0; index < pending.length; index += 2) {
      const x = pending[index];
      const y = pending[index + 1];
      currentStroke.current.push(x, y);
      livePoints.current.push(x * imgW, y * imgH);
    }
    pendingBrushPoints.current = [];
    const line = liveLineRef.current;
    if (line) {
      line.points(livePoints.current);
      line.getLayer()?.batchDraw();
    }
  };

  const queueBrushPoint = (point: { x: number; y: number }) => {
    const last = lastBrushPointRef.current;
    if (last) {
      const distancePx = Math.hypot(
        (point.x - last.x) * imgW * viewport.scale,
        (point.y - last.y) * imgH * viewport.scale,
      );
      if (distancePx < 1.25) return;
    }
    lastBrushPointRef.current = point;
    pendingBrushPoints.current.push(point.x, point.y);
    if (brushFrameRef.current === null) {
      brushFrameRef.current = window.requestAnimationFrame(flushBrushPreview);
    }
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (activeTool === 'pan' || e.evt.button === 1) {
      isPanning.current = true;
      panStart.current = { x: e.evt.clientX, y: e.evt.clientY };
      panVpStart.current = { x: viewport.x, y: viewport.y };
      return;
    }
    if ((activeTool === 'lasso' || activeTool === 'wand' || activeTool === 'rectSelect') && activeDoc) {
      const stage = stageRef.current; const pos = stage?.getPointerPosition();
      if (!pos) return;
      const imagePoint = screenToImage(pos, { viewport, imageWidth: imgW, imageHeight: imgH });
      if (!imagePoint?.inside) return;
      // Shift = add to selection, Alt = subtract (overrides the panel toggle)
      const mode: 'replace' | 'add' | 'subtract' = e.evt.altKey ? 'subtract' : e.evt.shiftKey ? 'add' : cleanupSettings.selectionMode;
      if (activeTool === 'wand') {
        void createFloodMask(activeDoc, imagePoint.x, imagePoint.y, cleanupSettings.magicThreshold, cleanupSettings.wandContiguous).then(({ src, coverage }) => {
          addMaskElement(
            { type: 'bitmap', src, mode: mode === 'subtract' ? 'erase' : 'add' },
            { replace: mode === 'replace' }
          );
          setWandInfo(`Выделено ~${Math.round(coverage * 100)}% изображения`);
          if (coverage > 0.7) setWandPending({ src, coverage });
        }).catch(() => window.alert('Не удалось прочитать пиксели композиции.'));
        return;
      }
      if (activeTool === 'rectSelect') {
        isRectSelecting.current = true;
        rectStart.current = { x: imagePoint.x, y: imagePoint.y };
        rectCurrent.current = { x: imagePoint.x, y: imagePoint.y };
        const rect = liveRectRef.current;
        if (rect) { rect.setAttrs({ x: imagePoint.x * imgW, y: imagePoint.y * imgH, width: 0, height: 0 }); rect.visible(true); rect.getLayer()?.batchDraw(); }
        return;
      }
      isLassoing.current = true; lassoPoints.current = [imagePoint.x, imagePoint.y];
      const line = liveLassoRef.current; if (line) { line.points([imagePoint.x * imgW, imagePoint.y * imgH]); line.visible(true); line.getLayer()?.batchDraw(); }
      return;
    }
    if ((activeTool === 'brush' || activeTool === 'maskBrush' || activeTool === 'eraser') && activeDoc) {
      // A captured pointer can occasionally miss Konva's synthetic pointerup
      // (for example when the browser window loses focus). Never start a
      // second stroke while the previous one is still marked active.
      if (isPainting.current) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const imagePoint = screenToImage(pos, { viewport, imageWidth: imgW, imageHeight: imgH });
      if (!imagePoint?.inside) return;
      const imgX = imagePoint.x * imgW;
      const imgY = imagePoint.y * imgH;
      isPainting.current = true;
      activePointerIdRef.current = e.evt.pointerId;
      try {
        const pointerTarget = e.evt.target as HTMLElement;
        pointerTarget.setPointerCapture(e.evt.pointerId);
        activePointerTargetRef.current = pointerTarget;
      } catch { /* capture is best-effort */ }
      strokeId.current = uid();
      currentStroke.current = [imagePoint.x, imagePoint.y];
      pendingBrushPoints.current = [];
      lastBrushPointRef.current = { x: imagePoint.x, y: imagePoint.y };
      // Start the live preview line
      livePoints.current = [imgX, imgY];
      const line = liveLineRef.current;
      if (line) {
        line.points(livePoints.current);
        // Eraser preview is a translucent marker — destination-out would visually
        // punch through the whole composite while drawing.
        line.stroke(activeTool === 'eraser' ? 'rgba(140,140,150,0.55)' : activeTool === 'maskBrush' ? 'rgba(255,128,0,0.6)' : cleanupSettings.brushColor);
        line.globalCompositeOperation('source-over');
        const previewDiameter = cleanupSettings.brushSize * activeDoc.height * previewScale;
        line.strokeWidth(activeTool === 'brush' ? previewDiameter * (0.3 + cleanupSettings.brushHardness * 0.7) : previewDiameter);
        line.shadowColor(activeTool === 'brush' ? cleanupSettings.brushColor : 'transparent');
        line.shadowBlur(activeTool === 'brush' ? (1 - cleanupSettings.brushHardness) * previewDiameter * 0.55 : 0);
        line.shadowOpacity(activeTool === 'brush' ? 0.75 : 0);
        line.visible(true);
        line.getLayer()?.batchDraw();
      }
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();

    if (isPanning.current) {
      const dx = e.evt.clientX - panStart.current.x;
      const dy = e.evt.clientY - panStart.current.y;
      setViewport({ x: panVpStart.current.x + dx, y: panVpStart.current.y + dy });
      return;
    }

    if (activeTool === 'rectSelect' && isRectSelecting.current && pos) {
      const imagePoint = screenToImage(pos, { viewport, imageWidth: imgW, imageHeight: imgH });
      if (imagePoint) {
        rectCurrent.current = { x: Math.min(1, Math.max(0, imagePoint.x)), y: Math.min(1, Math.max(0, imagePoint.y)) };
        const x = Math.min(rectStart.current.x, rectCurrent.current.x) * imgW;
        const y = Math.min(rectStart.current.y, rectCurrent.current.y) * imgH;
        const w = Math.abs(rectCurrent.current.x - rectStart.current.x) * imgW;
        const h = Math.abs(rectCurrent.current.y - rectStart.current.y) * imgH;
        const rect = liveRectRef.current;
        if (rect) { rect.setAttrs({ x, y, width: w, height: h }); rect.getLayer()?.batchDraw(); }
      }
      return;
    }
    if (activeTool === 'lasso' && isLassoing.current && pos) {
      const imagePoint = screenToImage(pos, { viewport, imageWidth: imgW, imageHeight: imgH });
      if (imagePoint?.inside) {
        const points = lassoPoints.current; const lastX = points.at(-2) ?? imagePoint.x, lastY = points.at(-1) ?? imagePoint.y;
        if (Math.hypot(imagePoint.x - lastX, imagePoint.y - lastY) > 0.002) points.push(imagePoint.x, imagePoint.y);
        const line = liveLassoRef.current; if (line) { line.points(points.flatMap((value, index) => index % 2 === 0 ? value * imgW : value * imgH)); line.getLayer()?.batchDraw(); }
      }
      return;
    }
    if ((activeTool === 'brush' || activeTool === 'maskBrush' || activeTool === 'eraser') && pos) {
      const imagePoint = screenToImage(pos, { viewport, imageWidth: imgW, imageHeight: imgH });
      if (!imagePoint?.inside) {
        if (cursorRef.current) cursorRef.current.style.display = 'none';
        return;
      }

      if (isPainting.current) {
        const coalescedEvents = typeof e.evt.getCoalescedEvents === 'function' ? e.evt.getCoalescedEvents() : [];
        const nativeEvents = coalescedEvents.length ? coalescedEvents : [e.evt];
        const bounds = stage.container().getBoundingClientRect();
        for (const nativeEvent of nativeEvents) {
          const nativePoint = {
            x: (nativeEvent.clientX - bounds.left) * stage.width() / Math.max(1, bounds.width),
            y: (nativeEvent.clientY - bounds.top) * stage.height() / Math.max(1, bounds.height),
          };
          const coalescedPoint = screenToImage(nativePoint, { viewport, imageWidth: imgW, imageHeight: imgH });
          if (coalescedPoint?.inside) queueBrushPoint(coalescedPoint);
        }
      }
    } else if (cursorRef.current) {
      cursorRef.current.style.display = 'none';
    }
  };

  const handleMouseUp = (e?: Konva.KonvaEventObject<PointerEvent>) => {
    isPanning.current = false;
    if (brushFrameRef.current !== null) {
      window.cancelAnimationFrame(brushFrameRef.current);
      flushBrushPreview();
    }
    if (activePointerIdRef.current !== null) {
      try { activePointerTargetRef.current?.releasePointerCapture(activePointerIdRef.current); } catch { /* already released */ }
      activePointerIdRef.current = null;
      activePointerTargetRef.current = null;
    }
    const selMode: 'replace' | 'add' | 'subtract' = e?.evt?.altKey ? 'subtract' : e?.evt?.shiftKey ? 'add' : cleanupSettings.selectionMode;
    if (isRectSelecting.current) {
      isRectSelecting.current = false;
      const x1 = Math.min(rectStart.current.x, rectCurrent.current.x);
      const y1 = Math.min(rectStart.current.y, rectCurrent.current.y);
      const x2 = Math.max(rectStart.current.x, rectCurrent.current.x);
      const y2 = Math.max(rectStart.current.y, rectCurrent.current.y);
      if ((x2 - x1) > 0.004 && (y2 - y1) > 0.004) {
        addMaskElement(
          { type: 'polygon', points: [x1, y1, x2, y1, x2, y2, x1, y2], mode: selMode === 'subtract' ? 'erase' : 'add' },
          { replace: selMode === 'replace' }
        );
      }
      const rect = liveRectRef.current; if (rect) { rect.visible(false); rect.getLayer()?.batchDraw(); }
    }
    if (isLassoing.current) {
      const points = [...lassoPoints.current];
      if (points.length >= 6) {
        addMaskElement(
          { type: 'polygon', points, mode: selMode === 'subtract' ? 'erase' : 'add' },
          { replace: selMode === 'replace' }
        );
      }
      isLassoing.current = false; lassoPoints.current = [];
      const line = liveLassoRef.current; if (line) { line.points([]); line.visible(false); line.getLayer()?.batchDraw(); }
    }
    if (isPainting.current && activeDoc) {
      const pts = [...currentStroke.current];
      if (pts.length >= 2) {
        const stroke: StrokeData = {
          id: strokeId.current,
          points: pts,
          size: cleanupSettings.brushSize,
          color: cleanupSettings.brushColor,
          opacity: 1,
          hardness: cleanupSettings.brushHardness,
          mode: activeTool === 'eraser' ? 'erase' : 'paint',
          purpose: activeTool === 'maskBrush' ? 'mask' : 'paint',
        };
        const editsMask = activeTool === 'maskBrush' || (activeTool === 'eraser' && activeDoc.selectedLayer?.type === 'mask');
        if (editsMask) {
          addMaskStroke(stroke);
        } else if (activeTool === 'eraser') {
          // The eraser is per-layer: it punches pixels out of the selected raster
          // layer (base by default) instead of drawing a global destination-out
          // stroke that would visually erase the whole composite.
          const selected = activeDoc.selectedLayer;
          const target = selected?.type === 'ai'
            ? { id: selected.id, type: 'ai' as const }
            : { type: 'base' as const };
          // Inside the erase mask the stroke must ADD coverage (paint mode);
          // applyEraseElements then punches the covered area out of the layer.
          addEraseElement(target, { type: 'brush', stroke: { ...stroke, mode: 'paint' } });
        } else {
          // If a drawing layer is selected, bake the stroke into its bitmap so
          // the drawing lives on that layer (moves/hides/reorders with it).
          const selected = activeDoc.selectedLayer;
          const drawingLayer = selected?.type === 'ai'
            ? activeDoc.aiLayers.find(layer => layer.id === selected.id && layer.operation === 'drawing')
            : undefined;
          if (drawingLayer) {
            const docId = activeDoc.id;
            const layerId = drawingLayer.id;
            void bakeStrokeIntoLayerSrc(drawingLayer, activeDoc.width, activeDoc.height, stroke)
              .then(src => {
                const state = useStore.getState();
                if (state.documents[state.activeDocIndex]?.id === docId) {
                  state.updateAiLayer(layerId, { src });
                }
              })
              .catch(() => { /* keep previous bitmap on failure */ });
          } else {
            addStroke(stroke);
          }
        }
        window.requestAnimationFrame(() => {
          const stage = stageRef.current;
          if (!stage) return;
          const scale = Math.min(1, 160 / Math.max(stage.width(), stage.height()));
          updateDocumentThumbnail(activeDoc.id, stage.toDataURL({ pixelRatio: scale }));
        });
      }
      isPainting.current = false;
      currentStroke.current = [];
      pendingBrushPoints.current = [];
      lastBrushPointRef.current = null;
      // Hide the live preview line (the committed stroke takes over)
      livePoints.current = [];
      const line = liveLineRef.current;
      if (line) {
        line.points([]);
        line.visible(false);
        line.getLayer()?.batchDraw();
      }
    }
  };

  // Keep a native safety net in addition to Konva's pointerup/cancel events.
  // Pointer capture is useful for long strokes, but some browsers deliver the
  // release only to the captured canvas and skip the React-Konva callback.
  finishPointerRef.current = () => handleMouseUp();
  useEffect(() => {
    const finish = (event: PointerEvent) => {
      if (activePointerIdRef.current === event.pointerId) finishPointerRef.current?.();
    };
    const finishOnBlur = () => {
      if (isPainting.current) finishPointerRef.current?.();
    };
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
    window.addEventListener('blur', finishOnBlur);
    return () => {
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      window.removeEventListener('blur', finishOnBlur);
    };
  }, []);

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const target = e.target as Konva.Node;
    const onStageOrBase = target === (stageRef.current as unknown as Konva.Node) || target.name() === 'base-image';

    // ── Text tool: place text at click position ──────────────────────────────
    // Konva bubbles clicks from raster Layers/Groups, so restricting this to
    // Stage/base-image made clicks on the visible artwork silently do nothing.
    // Any canvas click is a valid insertion point; clicking an existing text
    // object remains an edit/select gesture instead of creating a duplicate.
    if (activeTool === 'text' && activeDoc && target.getClassName() !== 'Text') {
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const imgPos = screenToImage(pos, { viewport, imageWidth: imgW, imageHeight: imgH });
      if (!imgPos || !imgPos.inside) return;

      // Clamp to image bounds
      const nx = Math.max(0, Math.min(0.95, imgPos.x));
      const ny = Math.max(0, Math.min(0.95, imgPos.y));

      pushHistory();
      const newText = {
        id: uid(),
        text: textSettings.draftText || 'Текст',
        fontFamily: textSettings.fontFamily,
        fontSize: textSettings.fontSize,
        fill: textSettings.fill,
        stroke: textSettings.stroke,
        strokeWidth: textSettings.strokeWidth,
        shadowColor: textSettings.shadowColor,
        shadowBlur: textSettings.shadowBlur,
        lineHeight: textSettings.lineHeight,
        align: textSettings.align,
        width: textSettings.width,
        x: nx,
        y: ny,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        visible: true,
      };
      addText(newText);
      setSelectedObject({ id: newText.id, type: 'text' });
      isNewTextRef.current = true;
      setInlineEditingTextId(newText.id);
      return;
    }

    // Deselect when clicking the empty stage OR the base image itself
    if (onStageOrBase) {
      setSelectedObject(null);
    }
  };

  // File drop
  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setLoadingFiles(true);
    setLoadErrors([]);
    const { docs, errors } = await loadImagesFromFiles(files);
    if (docs.length > 0) addDocuments(docs);
    setLoadErrors(errors);
    setLoadingFiles(false);
  }, [addDocuments]);

  // Paste image files copied from the desktop, Finder/Explorer or another
  // image editor. Text clipboard contents are left untouched so normal text
  // inputs and browser shortcuts keep their native behaviour.
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data) return;
      const target = event.target as HTMLElement | null;
      // Keep native paste behaviour in text fields (including the inline text
      // editor); image paste is intended for the canvas/workspace itself.
      if (target?.isContentEditable || (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const files = Array.from(data.files).filter(file => file.type.startsWith('image/'));
      if (files.length === 0) {
        for (const item of Array.from(data.items)) {
          if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length === 0) return;
      event.preventDefault();
      void handleFiles(files);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFiles]);

  // Keyboard shortcuts: [ ] brush size, Ctrl+C/J (layer from selection), Ctrl+D (deselect)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || target.isContentEditable;
      if (isEditable) return;

      const { cleanupSettings: cs, updateCleanupSettings: ucs } = useStore.getState();
      if (e.key === '[') ucs({ brushSize: Math.max(0.003, cs.brushSize * 0.85) });
      if (e.key === ']') ucs({ brushSize: Math.min(0.2, cs.brushSize * 1.18) });

      // ── Ctrl+D — снять выделение ────────────────────────────────────────
      if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const store = useStore.getState();
        const doc = store.documents[store.activeDocIndex];
        if (doc) {
          store.clearActiveMask();
          // Cancel any in-progress selection tools
          if (isLassoing.current) {
            isLassoing.current = false; lassoPoints.current = [];
            const line = liveLassoRef.current;
            if (line) { line.points([]); line.visible(false); line.getLayer()?.batchDraw(); }
          }
          if (isRectSelecting.current) {
            isRectSelecting.current = false;
            const rect = liveRectRef.current;
            if (rect) { rect.visible(false); rect.getLayer()?.batchDraw(); }
          }
          setWandPending(null);
        }
        return;
      }

      // ── Ctrl+C or Ctrl+J — создать слой из выделения ───────────────────
      if (e.ctrlKey && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'j')) {
        const store = useStore.getState();
        const doc = store.documents[store.activeDocIndex];
        if (!doc || !hasActiveSelection(doc)) {
          // No active selection — let browser handle Ctrl+C normally (text copy)
          if (e.key.toLowerCase() === 'j') e.preventDefault();
          return;
        }
        e.preventDefault();
        void createLayerFromSelection().then(err => {
          if (err) {
            // Show a brief overlay message via console (UI toast not available here)
            console.warn('[v0] createLayerFromSelection:', err);
          }
        });
        return;
      }

      if (e.key === 'Enter' || e.key === 'Escape') {
        // Enter/Escape commits the current transform: deselect the layer/object
        // so the transformer disappears and the layer "stays put".
        const store = useStore.getState();
        const doc = store.documents[store.activeDocIndex];
        if (doc?.selectedLayer && (doc.selectedLayer.type === 'base' || doc.selectedLayer.type === 'ai')) {
          store.selectLayer(null);
        }
        if (store.selectedObject) store.setSelectedObject(null);
      }
      if (e.key === 'Escape') {
        if (isPainting.current) {
          isPainting.current = false; currentStroke.current = []; livePoints.current = [];
          const line = liveLineRef.current;
          if (line) { line.points([]); line.visible(false); line.getLayer()?.batchDraw(); }
        }
        if (isLassoing.current) {
          isLassoing.current = false; lassoPoints.current = [];
          const line = liveLassoRef.current;
          if (line) { line.points([]); line.visible(false); line.getLayer()?.batchDraw(); }
        }
        if (isRectSelecting.current) {
          isRectSelecting.current = false;
          const rect = liveRectRef.current;
          if (rect) { rect.visible(false); rect.getLayer()?.batchDraw(); }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (documents.length === 0) {
    return (
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DropZone onFiles={handleFiles} loading={loadingFiles} errors={loadErrors} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        isolation: 'isolate',
        zIndex: 0,
        background: 'var(--bg-base)',
        // Cursor is set on the Stage itself (not here) so HUD panels and
        // buttons over the canvas keep the normal system cursor.
        cursor: 'default',
      }}
    >
      <ToolOptionsBar />

      {/* Navigation arrows */}
      {documents.length > 1 && (
        <>
          <button
            onClick={() => setActiveDoc(Math.max(0, activeDocIndex - 1))}
            disabled={activeDocIndex === 0}
            style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              zIndex: 20, width: 32, height: 48, borderRadius: 6,
              background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-default)',
              color: activeDocIndex === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: activeDocIndex === 0 ? 'not-allowed' : 'pointer',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >‹</button>
          <button
            onClick={() => setActiveDoc(Math.min(documents.length - 1, activeDocIndex + 1))}
            disabled={activeDocIndex === documents.length - 1}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              zIndex: 20, width: 32, height: 48, borderRadius: 6,
              background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-default)',
              color: activeDocIndex === documents.length - 1 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: activeDocIndex === documents.length - 1 ? 'not-allowed' : 'pointer',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >›</button>
          {/* Counter */}
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            zIndex: 20, background: 'rgba(0,0,0,0.55)', borderRadius: 12,
            padding: '3px 10px', fontSize: 12, color: 'var(--text-secondary)',
            backdropFilter: 'blur(4px)',
          }}>
            {activeDocIndex + 1} / {documents.length}
          </div>
        </>
      )}

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, display: 'flex', gap: 4, background: 'rgba(0,0,0,0.55)',
        borderRadius: 8, padding: '4px 8px', backdropFilter: 'blur(4px)',
        alignItems: 'center',
      }}>
        {[
          { label: '−', onClick: () => setViewport({ scale: Math.max(0.05, viewport.scale / 1.2) }) },
          { label: `${Math.round(viewport.scale * 100)}%`, onClick: fitToScreen },
          { label: '+', onClick: () => setViewport({ scale: Math.min(8, viewport.scale * 1.2) }) },
          { label: '⊡', onClick: fitToScreen, title: 'Вписать в экран' },
          { label: '1:1', onClick: () => setViewport({ scale: 1 }) },
        ].map((btn, i) => (
          <button
            key={i}
            onClick={btn.onClick}
            title={btn.title}
            style={{
              padding: '2px 8px', fontSize: 12, borderRadius: 4,
              border: 'none', background: 'transparent',
              color: 'var(--text-secondary)', cursor: 'pointer',
              minWidth: 32,
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Load more button */}
      <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 20 }}>
        <label style={{
          padding: '5px 10px', fontSize: 12, borderRadius: 6,
          border: '1px solid var(--border-default)',
          background: 'rgba(0,0,0,0.55)', color: 'var(--text-secondary)',
          cursor: 'pointer', backdropFilter: 'blur(4px)',
        }}>
          + Добавить
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={async e => {
              if (e.target.files) await handleFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {/* Errors */}
      {loadErrors.length > 0 && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 30,
          background: 'rgba(232,94,94,0.15)', border: '1px solid rgba(232,94,94,0.4)',
          borderRadius: 8, padding: '8px 12px', maxWidth: 260, fontSize: 11,
          color: 'var(--danger)',
        }}>
          {loadErrors.map((err, i) => <div key={i}>{err}</div>)}
          <button
            onClick={() => setLoadErrors([])}
            style={{ marginTop: 4, fontSize: 10, cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-muted)' }}
          >
            Закрыть
          </button>
        </div>
      )}

      {/* Konva Stage */}
      {activeDoc && containerSize.w > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.w}
          height={containerSize.h}
          onWheel={handleWheel}
          onPointerDown={handleMouseDown}
          onPointerMove={handleMouseMove}
          onPointerUp={handleMouseUp}
          onPointerCancel={handleMouseUp}
          onClick={handleStageClick}
          onPointerLeave={() => { if (!isPainting.current && cursorRef.current) cursorRef.current.style.display = 'none'; }}
          style={{
            display: 'block',
            touchAction: 'none',
            cursor: activeTool === 'pan' ? 'grab' : (activeTool === 'lasso' || activeTool === 'wand' || activeTool === 'rectSelect') ? 'crosshair' : activeTool === 'text' ? 'text' : 'default',
          }}
        >
          {/* Base image layer — key includes fontsVersion so the canvas
              repaints once web fonts finish loading */}
          <Layer
            key={`layer-${fontsVersion}`}
            x={viewport.x}
            y={viewport.y}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
          >
            {/* Transparency checkerboard under everything */}
            {checkerPattern.current && (
              <Rect
                name="checker-bg"
                width={imgW}
                height={imgH}
                fillPatternImage={checkerPattern.current as unknown as HTMLImageElement}
                fillPatternRepeat="repeat"
                listening={false}
              />
            )}

            {/* Raster stack (base + AI) rendered bottom → top following the unified layer order */}
            {resolveLayerOrder(activeDoc).map(ref => {
              if (ref.type === 'base') {
                if (!layerVisibility.base || baseReplaced || activeDoc.baseLayer?.visible === false) return null;
                return (
                  <BaseLayerNode
                    key="base-node"
                    doc={activeDoc}
                    width={imgW}
                    height={imgH}
                    interactive={activeTool === 'select'}
                    isSelected={activeDoc.selectedLayer?.type === 'base'}
                    onSelect={() => { selectLayer({ id: activeDoc.baseLayer?.id ?? `base-${activeDoc.id}`, type: 'base' }); }}
                    onContextMenu={e => {
                      e.evt.preventDefault();
                      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, target: { id: activeDoc.baseLayer?.id ?? `base-${activeDoc.id}`, type: 'base' } });
                    }}
                  />
                );
              }
              if (ref.type === 'ai') {
                const layer = (activeDoc.aiLayers ?? []).find(item => item.id === ref.id);
                if (!layer || !layerVisibility.cleanup || !layer.visible) return null;
                return (
                  <RasterLayerNode
                    key={layer.id}
                    layer={layer}
                    width={imgW}
                    height={imgH}
                    interactive={activeTool === 'select'}
                    isSelected={activeDoc.selectedLayer?.type === 'ai' && activeDoc.selectedLayer.id === layer.id}
                    onSelect={() => selectLayer({ id: layer.id, type: 'ai' })}
                    onContextMenu={e => {
                      e.evt.preventDefault();
                      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, target: { id: layer.id, type: 'ai' } });
                    }}
                  />
                );
              }
              return null;
            })}

            <Group clipX={0} clipY={0} clipWidth={imgW} clipHeight={imgH}>

            {/* Committed brush strokes — rendered offscreen so erase-mode strokes
                only affect the strokes themselves, never the layers below. */}
            {layerVisibility.cleanup && (
              <CleanupStrokesNode
                strokes={activeDoc.cleanup.strokes.filter(stroke => stroke.purpose !== 'mask')}
                width={imgW}
                height={imgH}
                lineScale={activeDoc.height * previewScale}
              />
            )}

            {/* Persistent editor-only mask overlays */}
            {(activeDoc.masks ?? []).filter(mask => mask.visible).map(mask => (
              <MaskOverlayNode key={mask.id} elements={mask.elements} strokes={mask.strokes} width={imgW} height={imgH} opacity={mask.opacity} />
            ))}

            {/* Live lasso contour */}
            <Line ref={liveLassoRef} points={[]} stroke="rgb(255, 128, 0)" strokeWidth={2 / viewport.scale} dash={[7, 5]} closed fill="rgba(255,128,0,0.22)" listening={false} visible={false} />

            {/* Live rectangular selection */}
            <Rect ref={liveRectRef} stroke="rgb(255, 128, 0)" strokeWidth={2 / viewport.scale} dash={[7, 5]} fill="rgba(255,128,0,0.22)" listening={false} visible={false} />

            {/* Live stroke while drawing (updated imperatively) */}
            <Line
              ref={liveLineRef}
              points={livePoints.current}
              stroke={cleanupSettings.brushColor}
              strokeWidth={activeDoc ? cleanupSettings.brushSize * activeDoc.height * previewScale : 10}
              lineCap="round"
              lineJoin="round"
              tension={0.3}
              perfectDrawEnabled={false}
              listening={false}
              visible={false}
            />

            {/* Watermarks, texts and shapes rendered bottom → top following the
                unified layer order, so panel order always matches the canvas. */}
            {resolveLayerOrder(activeDoc).map(ref => {
              if (ref.type === 'watermark') {
                const wm = activeDoc.watermarks.find(item => item.id === ref.id);
                if (!wm || !layerVisibility.watermarks) return null;
                return (
                  <WatermarkNode
                    key={wm.id}
                    wm={wm}
                    docWidth={activeDoc.width}
                    docHeight={activeDoc.height}
                    previewScale={previewScale}
                    isSelected={selectedObject?.id === wm.id}
                    onSelect={() => setSelectedObject({ id: wm.id, type: 'watermark' })}
                    onChange={updates => updateWatermark(wm.id, updates)}
                    onBeforeChange={pushHistory}
                  />
                );
              }
              if (ref.type === 'text') {
                const txt = activeDoc.texts.find(item => item.id === ref.id);
                if (!txt || !layerVisibility.texts) return null;
                return (
                  <TextNode
                    key={txt.id}
                    txt={txt}
                    docWidth={activeDoc.width}
                    docHeight={activeDoc.height}
                    previewScale={previewScale}
                    isSelected={selectedObject?.id === txt.id}
                    isEditing={inlineEditingTextId === txt.id}
                    onSelect={() => setSelectedObject({ id: txt.id, type: 'text' })}
                    onChange={updates => updateText(txt.id, updates)}
                    onBeforeChange={pushHistory}
                    onEditRequest={() => {
                      setSelectedObject({ id: txt.id, type: 'text' });
                      isNewTextRef.current = false;
                      setInlineEditingTextId(txt.id);
                    }}
                  />
                );
              }
              if (ref.type === 'shape') {
                const shape = (activeDoc.shapes ?? []).find(item => item.id === ref.id);
                if (!shape || !layerVisibility.shapes) return null;
                return (
                  <ShapeNode
                    key={shape.id}
                    shape={shape}
                    docWidth={activeDoc.width}
                    docHeight={activeDoc.height}
                    previewScale={previewScale}
                    isSelected={selectedObject?.id === shape.id}
                    onSelect={() => setSelectedObject({ id: shape.id, type: 'shape' })}
                    onChange={updates => updateShape(shape.id, updates)}
                    onBeforeChange={pushHistory}
                  />
                );
              }
              if (ref.type === 'bubble') {
                const bubble = (activeDoc.bubbles ?? []).find(item => item.id === ref.id);
                if (!bubble || !layerVisibility.shapes) return null;
                return (
                  <BubbleNode
                    key={bubble.id}
                    bubble={bubble}
                    docWidth={activeDoc.width}
                    docHeight={activeDoc.height}
                    previewScale={previewScale}
                    isSelected={selectedObject?.id === bubble.id}
                    onSelect={() => setSelectedObject({ id: bubble.id, type: 'bubble' })}
                    onChange={updates => updateBubble(bubble.id, updates)}
                    onBeforeChange={pushHistory}
                    onEditRequest={() => {
                      setSelectedObject({ id: bubble.id, type: 'bubble' });
                      setLeftTab('bubble');
                    }}
                  />
                );
              }
              return null;
            })}

            {/* Crop overlay */}
            {activeTool === 'crop' && cropRect && (
              <CropOverlay
                cropRect={cropRect}
                imgW={imgW}
                imgH={imgH}
                onChange={setCropRect}
              />
            )}
            </Group>
          </Layer>
        </Stage>
      )}

      {/* Layer crop confirmation bar */}
      {layerCropTarget && activeTool === 'crop' && (
        <div style={{
          position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
          zIndex: 40, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-panel-raised)', border: '1px solid var(--border-default)',
          borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}>
          <span>Обрезка слоя — выделите область рамкой</span>
          <button
            type="button"
            onClick={() => applyLayerCrop()}
            style={{ padding: '4px 10px', fontSize: 12, borderRadius: 5, border: 'none', background: 'var(--accent)', color: 'var(--bg-base)', cursor: 'pointer' }}
          >
            Применить
          </button>
          <button
            type="button"
            onClick={() => cancelLayerCrop()}
            style={{ padding: '4px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            Отмена
          </button>
        </div>
      )}

      {/* Wand coverage chip */}
      {wandInfo && !wandPending && (
        <div style={{
          position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
          zIndex: 30, background: 'rgba(0,0,0,0.65)', borderRadius: 12,
          padding: '4px 12px', fontSize: 12, color: 'var(--text-secondary)',
          backdropFilter: 'blur(4px)',
        }}>
          {wandInfo}
        </div>
      )}

      {/* Wand: selection covers >70% — confirm keeping it */}
      {wandPending && (
        <div role="alertdialog" aria-label="Слишком большое выделение" style={{
          position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
          zIndex: 40, background: 'var(--bg-panel-raised)', border: '1px solid var(--border-default)',
          borderRadius: 8, padding: '10px 14px', maxWidth: 340, fontSize: 12,
          color: 'var(--text-primary)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}>
          <div style={{ marginBottom: 8 }}>
            {`Выделено ~${Math.round(wandPending.coverage * 100)}% изображения. Оставить выделение или отменить и уменьшить порог?`}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => { useStore.getState().undo(); setWandPending(null); }}
              style={{ padding: '4px 10px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Отменить
            </button>
            <button
              type="button"
              onClick={() => setWandPending(null)}
              style={{ padding: '4px 10px', fontSize: 12, borderRadius: 5, border: 'none', background: 'var(--accent)', color: 'var(--bg-base)', cursor: 'pointer' }}
            >
              Оставить
            </button>
          </div>
        </div>
      )}

      {/* Layer context menu */}
      {contextMenu && <LayerContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}

      {/* Inline text editor overlay */}
      {inlineEditingTextId && activeDoc && (() => {
        const editingTxt = activeDoc.texts.find(t => t.id === inlineEditingTextId);
        if (!editingTxt) return null;
        return (
          <InlineTextEditor
            key={inlineEditingTextId}
            textObj={editingTxt}
            docWidth={activeDoc.width * previewScale}
            docHeight={activeDoc.height * previewScale}
            viewport={viewport}
            isNew={isNewTextRef.current}
            onCommit={newText => {
              if (newText.trim() === '' && isNewTextRef.current) {
                // Delete the empty newly-created text
                useStore.getState().deleteSelectedObject();
              } else {
                updateText(inlineEditingTextId, { text: newText });
              }
              setInlineEditingTextId(null);
            }}
            onCancel={() => {
              if (isNewTextRef.current) {
                useStore.getState().deleteSelectedObject();
              }
              setInlineEditingTextId(null);
            }}
          />
        );
      })()}

      {/* Brush cursor (positioned imperatively, no re-renders) */}
      {(activeTool === 'brush' || activeTool === 'maskBrush' || activeTool === 'eraser') && (
        <div
          ref={cursorRef}
          style={{
            position: 'absolute',
            top: 0, left: 0,
            display: 'none',
            borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.85)',
            outline: '1px solid rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            willChange: 'transform',
            contain: 'layout paint',
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
}
