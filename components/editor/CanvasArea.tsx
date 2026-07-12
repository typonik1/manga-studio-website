'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Text, Transformer, Group, Rect, Ellipse, Arrow, Star } from 'react-konva';
import Konva from 'konva';
import { useStore } from '@/store/useStore';
import { uid } from '@/utils/imageUtils';
import type { StrokeData, WatermarkObject, TextObject, ShapeObject, CropRect } from '@/types';
import { DropZone } from './DropZone';
import { ToolOptionsBar } from './ToolOptionsBar';
import { loadImagesFromFiles } from '@/utils/imageUtils';

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
  onSelect: () => void;
  onChange: (updates: Partial<TextObject>) => void;
  onBeforeChange: () => void;
  onEditRequest: () => void;
}) {
  const nodeRef = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

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
    addStroke, updateWatermark, updateText, updateShape,
    selectedObject, setSelectedObject,
    layerVisibility,
    viewport, setViewport,
    addDocuments,
    pushHistory, setLeftTab,
    fontsVersion, cropRect, setCropRect, updateDocumentThumbnail,
  } = useStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const isPainting = useRef(false);
  const currentStroke = useRef<number[]>([]);
  const strokeId = useRef<string>('');
  // Live stroke rendered imperatively (no React re-renders while drawing)
  const liveLineRef = useRef<Konva.Line>(null);
  const livePoints = useRef<number[]>([]);
  // Brush cursor updated imperatively via DOM
  const cursorRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);

  const activeDoc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;
  const baseImg = useImage(activeDoc?.originalSrc);
  const cleanupImg = useImage(activeDoc?.cleanup.committed);

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

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool === 'pan' || e.evt.button === 1) {
      isPanning.current = true;
      panStart.current = { x: e.evt.clientX, y: e.evt.clientY };
      panVpStart.current = { x: viewport.x, y: viewport.y };
      return;
    }
    if ((activeTool === 'brush' || activeTool === 'eraser') && activeDoc) {
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      // convert to image coords normalized
      const imgX = (pos.x - viewport.x) / viewport.scale;
      const imgY = (pos.y - viewport.y) / viewport.scale;
      const nx = imgX / imgW;
      const ny = imgY / imgH;
      isPainting.current = true;
      strokeId.current = uid();
      currentStroke.current = [nx, ny];
      // Start the live preview line
      livePoints.current = [imgX, imgY];
      const line = liveLineRef.current;
      if (line) {
        line.points(livePoints.current);
        line.stroke(activeTool === 'eraser' ? '#000000' : cleanupSettings.brushColor);
        line.globalCompositeOperation(activeTool === 'eraser' ? 'destination-out' : 'source-over');
        line.strokeWidth(cleanupSettings.brushSize * activeDoc.height * previewScale);
        line.visible(true);
        line.getLayer()?.batchDraw();
      }
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();

    if (isPanning.current) {
      const dx = e.evt.clientX - panStart.current.x;
      const dy = e.evt.clientY - panStart.current.y;
      setViewport({ x: panVpStart.current.x + dx, y: panVpStart.current.y + dy });
      return;
    }

    if ((activeTool === 'brush' || activeTool === 'eraser') && pos) {
      const imgX = (pos.x - viewport.x) / viewport.scale;
      const imgY = (pos.y - viewport.y) / viewport.scale;

      // Update the cursor circle directly via DOM (no React re-render)
      const cursor = cursorRef.current;
      if (cursor) {
        const rad = (cleanupSettings.brushSize * (activeDoc?.height ?? 1000) * previewScale * viewport.scale) / 2;
        cursor.style.display = 'block';
        cursor.style.left = `${pos.x - rad}px`;
        cursor.style.top = `${pos.y - rad}px`;
        cursor.style.width = `${rad * 2}px`;
        cursor.style.height = `${rad * 2}px`;
      }

      if (isPainting.current) {
        const nx = imgX / imgW;
        const ny = imgY / imgH;
        currentStroke.current.push(nx, ny);
        // Update the live line imperatively for instant feedback
        livePoints.current.push(imgX, imgY);
        const line = liveLineRef.current;
        if (line) {
          line.points(livePoints.current);
          line.getLayer()?.batchDraw();
        }
      }
    } else if (cursorRef.current) {
      cursorRef.current.style.display = 'none';
    }
  };

  const handleMouseUp = () => {
    isPanning.current = false;
    if (isPainting.current && activeDoc) {
      const pts = [...currentStroke.current];
      if (pts.length >= 2) {
        const stroke: StrokeData = {
          id: strokeId.current,
          points: pts,
          size: cleanupSettings.brushSize,
          color: cleanupSettings.brushColor,
          opacity: 1,
          mode: activeTool === 'eraser' ? 'erase' : 'paint',
        };
        addStroke(stroke);
        window.requestAnimationFrame(() => {
          const stage = stageRef.current;
          if (!stage) return;
          const scale = Math.min(1, 160 / Math.max(stage.width(), stage.height()));
          updateDocumentThumbnail(activeDoc.id, stage.toDataURL({ pixelRatio: scale }));
        });
      }
      isPainting.current = false;
      currentStroke.current = [];
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

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Deselect when clicking the empty stage OR the base image itself
    // (the image covers the whole canvas, so it counts as "empty space")
    const target = e.target as Konva.Node;
    if (target === (stageRef.current as unknown as Konva.Node) || target.name() === 'base-image') {
      setSelectedObject(null);
    }
  };

  // File drop
  async function handleFiles(files: File[]) {
    setLoadingFiles(true);
    setLoadErrors([]);
    const { docs, errors } = await loadImagesFromFiles(files);
    if (docs.length > 0) addDocuments(docs);
    setLoadErrors(errors);
    setLoadingFiles(false);
  }

  // Keyboard brush size [ ]
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const { cleanupSettings: cs, updateCleanupSettings: ucs } = useStore.getState();
      if (e.key === '[') ucs({ brushSize: Math.max(0.003, cs.brushSize * 0.85) });
      if (e.key === ']') ucs({ brushSize: Math.min(0.2, cs.brushSize * 1.18) });
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
        background: '#141414',
        cursor: activeTool === 'pan' ? 'grab' : activeTool === 'brush' || activeTool === 'eraser' ? 'none' : activeTool === 'lasso' || activeTool === 'wand' ? 'crosshair' : 'default',
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
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleStageClick}
          style={{ display: 'block' }}
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
            {/* Image background */}
            {layerVisibility.base && baseImg && (
              <KonvaImage name="base-image" image={baseImg} width={imgW} height={imgH} />
            )}

            {/* Cleanup committed layer */}
            {layerVisibility.cleanup && cleanupImg && (
              <KonvaImage name="base-image" image={cleanupImg} width={imgW} height={imgH} />
            )}

            {/* Live brush strokes */}
            {layerVisibility.cleanup && activeDoc.cleanup.strokes.map(stroke => {
              const pts = stroke.points.flatMap((v, i) =>
                i % 2 === 0 ? v * imgW : v * imgH
              );
              return (
                <Line
                  key={stroke.id}
                  points={pts}
                  stroke={stroke.color}
                  strokeWidth={stroke.size * activeDoc.height * previewScale}
                  lineCap="round"
                  lineJoin="round"
                  opacity={stroke.opacity}
                  tension={0.3}
                  globalCompositeOperation={stroke.mode === 'erase' ? 'destination-out' : 'source-over'}
                />
              );
            })}

            {/* Live stroke while drawing (updated imperatively) */}
            <Line
              ref={liveLineRef}
              points={livePoints.current}
              stroke={cleanupSettings.brushColor}
              strokeWidth={activeDoc ? cleanupSettings.brushSize * activeDoc.height * previewScale : 10}
              lineCap="round"
              lineJoin="round"
              tension={0.3}
              listening={false}
              visible={false}
            />

            {/* Watermarks */}
            {layerVisibility.watermarks && activeDoc.watermarks.map(wm => (
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
            ))}

            {/* Texts */}
            {layerVisibility.texts && activeDoc.texts.map(txt => (
              <TextNode
                key={txt.id}
                txt={txt}
                docWidth={activeDoc.width}
                docHeight={activeDoc.height}
                previewScale={previewScale}
                isSelected={selectedObject?.id === txt.id}
                onSelect={() => setSelectedObject({ id: txt.id, type: 'text' })}
                onChange={updates => updateText(txt.id, updates)}
                onBeforeChange={pushHistory}
                onEditRequest={() => {
                  setSelectedObject({ id: txt.id, type: 'text' });
                  setLeftTab('text');
                }}
              />
            ))}

            {/* Shapes */}
            {layerVisibility.shapes && (activeDoc.shapes ?? []).map(shape => (
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
            ))}

            {/* Crop overlay */}
            {activeTool === 'crop' && cropRect && (
              <CropOverlay
                cropRect={cropRect}
                imgW={imgW}
                imgH={imgH}
                onChange={setCropRect}
              />
            )}
          </Layer>
        </Stage>
      )}

      {/* Brush cursor (positioned imperatively, no re-renders) */}
      {(activeTool === 'brush' || activeTool === 'eraser') && (
        <div
          ref={cursorRef}
          style={{
            position: 'absolute',
            display: 'none',
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.7)',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        />
      )}
    </div>
  );
}
