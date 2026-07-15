'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Group, Path, Circle, Text as KonvaText, Transformer } from 'react-konva';
import Konva from 'konva';
import type { BubbleObject, BubbleTail } from '@/types';
import { getBubblePath, resolveTail, tailTipPixels, migrateTail, getThoughtTailCircles } from '@/utils/bubbleGeometry';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

/** Convert local-pixel tip drag position back to structured tail params */
function tipPixelToTail(
  tipLocalX: number,
  tipLocalY: number,
  bodyW: number,
  bodyH: number,
  prevTail: BubbleTail,
): BubbleTail {
  const hw = bodyW / 2;
  const hh = bodyH / 2;
  const shorter = Math.min(bodyW, bodyH);

  // Determine closest side
  const distTop    = Math.abs(tipLocalY + hh);
  const distBottom = Math.abs(tipLocalY - hh);
  const distLeft   = Math.abs(tipLocalX + hw);
  const distRight  = Math.abs(tipLocalX - hw);
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);

  let side: BubbleTail['side'];
  let anchor: number;
  let length: number;

  if (minDist === distTop || tipLocalY < -hh) {
    side   = 'top';
    anchor = clamp(0.5 + tipLocalX / bodyW, 0.12, 0.88);
    length = clamp((Math.abs(tipLocalY) - hh) / shorter, 0.08, 0.80);
  } else if (minDist === distBottom || tipLocalY > hh) {
    side   = 'bottom';
    anchor = clamp(0.5 + tipLocalX / bodyW, 0.12, 0.88);
    length = clamp((tipLocalY - hh) / shorter, 0.08, 0.80);
  } else if (minDist === distLeft || tipLocalX < -hw) {
    side   = 'left';
    anchor = clamp(0.5 + tipLocalY / bodyH, 0.12, 0.88);
    length = clamp((Math.abs(tipLocalX) - hw) / shorter, 0.08, 0.80);
  } else {
    side   = 'right';
    anchor = clamp(0.5 + tipLocalY / bodyH, 0.12, 0.88);
    length = clamp((tipLocalX - hw) / shorter, 0.08, 0.80);
  }

  return {
    enabled: true,
    side,
    anchor,
    length,
    width: prevTail.width,
    curve:  prevTail.curve ?? 0.3,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function BubbleNode({
  bubble,
  docWidth,
  docHeight,
  previewScale,
  isSelected,
  onSelect,
  onChange,
  onBeforeChange,
  onEditRequest,
}: {
  bubble: BubbleObject;
  docWidth: number;
  docHeight: number;
  previewScale: number;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<BubbleObject>) => void;
  onBeforeChange: () => void;
  onEditRequest: () => void;
}) {
  const groupRef   = useRef<Konva.Group>(null);
  const trRef      = useRef<Konva.Transformer>(null);
  const tipRef     = useRef<Konva.Circle>(null);
  const didPushRef = useRef(false);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (!bubble.visible) return null;

  const pW = docWidth * previewScale;
  const pH = docHeight * previewScale;

  const groupX = bubble.x * pW;
  const groupY = bubble.y * pH;
  const bodyW  = bubble.width  * pW;
  const bodyH  = bubble.height * pH;

  // Resolve tail to structured model (migrates legacy tipX/tipY if needed)
  const resolvedTail = bubble.tail
    ? migrateTail(bubble.tail, bodyW, bodyH)
    : null;

  // Geometry params for path builder
  const geomParams = {
    x: 0, y: 0,
    width: bodyW,
    height: bodyH,
    rotation: bubble.rotation,
    tail: resolvedTail,
  };

  const pathString = getBubblePath(bubble.kind, geomParams);

  // Thought tail circles
  const thoughtCircles = bubble.kind === 'thought'
    ? getThoughtTailCircles(resolvedTail, bodyW, bodyH)
    : [];

  // Tip handle position in local pixel coords
  const hasTail  = !!resolvedTail?.enabled;
  const tipLocal = hasTail && resolvedTail ? tailTipPixels(resolvedTail, bodyW, bodyH) : { x: 0, y: 0 };

  // Text layout
  const fontSize = bubble.text.fontSize * previewScale;
  const padding  = Math.max(8, bodyW * 0.08) * previewScale;
  const isDashed = bubble.kind === 'whisper';

  // ── Drag handlers ────────────────────────────────────────────────────────
  const handleGroupDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange({ x: e.target.x() / pW, y: e.target.y() / pH });
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    if (!node) return;
    const scX = node.scaleX();
    const scY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onChange({
      x:        node.x() / pW,
      y:        node.y() / pH,
      width:    bubble.width  * scX,
      height:   bubble.height * scY,
      rotation: node.rotation(),
    });
  };

  // Tip handle drag – pushHistory once at start, update live without history
  const handleTipDragStart = () => {
    if (!didPushRef.current) {
      onBeforeChange();
      didPushRef.current = true;
    }
  };

  const handleTipDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!resolvedTail) return;
    const newTail = tipPixelToTail(e.target.x(), e.target.y(), bodyW, bodyH, resolvedTail);
    // Live update without history
    onChange({ tail: newTail });
  };

  const handleTipDragEnd = () => {
    didPushRef.current = false;
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={groupX}
        y={groupY}
        scaleX={1}
        scaleY={1}
        rotation={bubble.rotation}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onEditRequest}
        onDblTap={onEditRequest}
        onDragStart={onBeforeChange}
        onTransformStart={onBeforeChange}
        onDragEnd={handleGroupDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        {/* ── Body ─────────────────────────────────────────────────────── */}
        <Path
          data={pathString}
          fill={bubble.fill}
          stroke={bubble.stroke}
          strokeWidth={bubble.strokeWidth * previewScale}
          dash={isDashed ? [6 * previewScale, 4 * previewScale] : undefined}
          dashEnabled={isDashed}
        />

        {/* ── Thought tail circles ─────────────────────────────────────── */}
        {thoughtCircles.map((c, i) => (
          <Circle
            key={i}
            x={c.cx}
            y={c.cy}
            radius={c.r}
            fill={bubble.fill}
            stroke={bubble.stroke}
            strokeWidth={bubble.strokeWidth * previewScale}
            listening={false}
          />
        ))}

        {/* ── Text ─────────────────────────────────────────────────────── */}
        <KonvaText
          x={-bodyW / 2}
          y={-bodyH / 2}
          width={bodyW}
          height={bodyH}
          text={bubble.text.content}
          fontFamily={bubble.text.fontFamily}
          fontSize={fontSize}
          fill={bubble.text.fill}
          align={bubble.text.align}
          lineHeight={bubble.text.lineHeight}
          verticalAlign="middle"
          padding={padding}
          wrap="word"
          listening={false}
        />

        {/* ── Tail tip handle (large, grab-friendly) ───────────────────── */}
        {isSelected && hasTail && resolvedTail && (
          <Circle
            ref={tipRef}
            x={tipLocal.x}
            y={tipLocal.y}
            radius={10 * previewScale}
            fill="#ff6b6b"
            stroke="#ffffff"
            strokeWidth={2 * previewScale}
            hitStrokeWidth={18 * previewScale}
            draggable
            onMouseEnter={e => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'grab';
            }}
            onMouseLeave={e => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = '';
            }}
            onDragStart={e => {
              e.cancelBubble = true;
              handleTipDragStart();
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'grabbing';
            }}
            onDragMove={e => {
              e.cancelBubble = true;
              handleTipDragMove(e);
            }}
            onDragEnd={e => {
              e.cancelBubble = true;
              handleTipDragEnd();
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'grab';
            }}
          />
        )}
      </Group>

      {/* ── Transformer ──────────────────────────────────────────────────── */}
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox;
            return newBox;
          }}
          rotateEnabled
          keepRatio={false}
          enabledAnchors={[
            'top-left', 'top-center', 'top-right',
            'middle-left', 'middle-right',
            'bottom-left', 'bottom-center', 'bottom-right',
          ]}
        />
      )}
    </>
  );
}
