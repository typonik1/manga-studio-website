'use client';

import { useRef, useEffect, useState } from 'react';
import { Group, Path, Text as KonvaText, Transformer } from 'react-konva';
import Konva from 'konva';
import { BubbleObject } from '@/types';
import { getBubblePath } from '@/utils/bubbleGeometry';

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
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const bodyRef = useRef<Konva.Path>(null);
  const [textWidth, setTextWidth] = useState<number>(0);
  const [textHeight, setTextHeight] = useState<number>(0);

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
  const bodyW = bubble.width * pW;
  const bodyH = bubble.height * pH;

  // Compute geometry parameters
  const geomParams = {
    x: 0, // relative to group
    y: 0,
    width: bodyW / pW,
    height: bodyH / pH,
    rotation: bubble.rotation,
    tipX: bubble.tail?.tipX ?? 0,
    tipY: bubble.tail?.tipY ?? 0,
    tailWidth: bubble.tail?.width ?? 0.2,
  };

  const pathString = getBubblePath(bubble.kind, geomParams);

  // Text sizing
  const fontSize = bubble.text.fontSize * previewScale;
  const padding = 10 * previewScale;
  const maxTextW = bodyW - padding * 2;
  const maxTextH = bodyH - padding * 2;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange({ x: e.target.x() / pW, y: e.target.y() / pH });
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    if (!node) return;
    onChange({
      x: node.x() / pW,
      y: node.y() / pH,
      width: node.scaleX() * bubble.width,
      height: node.scaleY() * bubble.height,
      rotation: node.rotation(),
    });
  };

  const isDashed = bubble.kind === 'whisper';

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
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        {/* Bubble body */}
        <Path
          ref={bodyRef}
          data={pathString}
          fill={bubble.fill}
          stroke={bubble.stroke}
          strokeWidth={bubble.strokeWidth * previewScale}
          strokeDasharray={isDashed ? [6 * previewScale, 4 * previewScale] : undefined}
          scaleX={bodyW / pW}
          scaleY={bodyH / pH}
        />

        {/* Text inside bubble */}
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
          onClick={onSelect}
          onTap={onSelect}
          onDblClick={onEditRequest}
          onDblTap={onEditRequest}
        />

        {/* Tail anchor point (visible when selected) */}
        {isSelected && bubble.tail?.enabled && (
          <KonvaText
            x={(bubble.tail.tipX - bubble.x) * pW}
            y={(bubble.tail.tipY - bubble.y) * pH}
            text="●"
            fontSize={12 * previewScale}
            fill="#ff6b6b"
            offsetX={6 * previewScale}
            offsetY={6 * previewScale}
            draggable
            onDragStart={onBeforeChange}
            onDragEnd={e => {
              const newTipX = bubble.x + (e.target.x() + 6 * previewScale) / pW;
              const newTipY = bubble.y + (e.target.y() + 6 * previewScale) / pH;
              onChange({
                tail: bubble.tail ? { ...bubble.tail, tipX: newTipX, tipY: newTipY } : null,
              });
            }}
          />
        )}
      </Group>

      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
          rotateEnabled
          keepRatio={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        />
      )}
    </>
  );
}
