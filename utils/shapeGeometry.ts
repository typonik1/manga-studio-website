import type { ShapeKind } from '@/types';

export interface ShapeGeometry {
  strokePath?: string;
  fillPath?: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function arrowHead(x: number, y: number, angle: number, length: number, width: number) {
  const left = angle + Math.PI * 0.78;
  const right = angle - Math.PI * 0.78;
  return [
    `M ${x} ${y}`,
    `L ${x + Math.cos(left) * length} ${y + Math.sin(left) * length}`,
    `L ${x + Math.cos(right) * length} ${y + Math.sin(right) * length}`,
    'Z',
  ].join(' ');
}

function straightArrow(width: number, doubleEnded = false): ShapeGeometry {
  const x1 = -width / 2, x2 = width / 2;
  const head = Math.max(10, Math.min(width * 0.22, 32));
  const strokePath = `M ${x1} 0 L ${x2} 0`;
  const end = arrowHead(x2, 0, 0, head, head * 0.8);
  if (!doubleEnded) return { strokePath, fillPath: end };
  return {
    strokePath,
    fillPath: `${end} ${arrowHead(x1, 0, Math.PI, head, head * 0.8)}`,
  };
}

function curvedArrow(width: number, height: number, curve: number): ShapeGeometry {
  const x1 = -width / 2;
  const x2 = width / 2;
  const controlY = clamp(curve, -1, 1) * height * 0.8;
  const tipX = x2;
  const tipY = 0;
  const tangentX = x2 - 0;
  const tangentY = 0 - controlY;
  const angle = Math.atan2(tangentY, tangentX);
  return {
    strokePath: `M ${x1} 0 Q 0 ${controlY} ${x2} 0`,
    fillPath: arrowHead(tipX, tipY, angle, Math.max(10, Math.min(width * 0.2, 32)), 1),
  };
}

function elbowArrow(width: number, height: number): ShapeGeometry {
  const x1 = -width / 2;
  const x2 = width / 2;
  const y = height * 0.28;
  return {
    strokePath: `M ${x1} ${y} L 0 ${y} L 0 ${-y} L ${x2} ${-y}`,
    fillPath: arrowHead(x2, -y, 0, Math.max(10, Math.min(width * 0.2, 32)), 1),
  };
}

function blockArrow(width: number, height: number): ShapeGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const shaft = Math.min(width * 0.38, height * 0.72);
  const tip = hw;
  return {
    fillPath: [
      `M ${-hw} ${-shaft / 2}`,
      `L ${0} ${-shaft / 2}`,
      `L ${0} ${-hh}`,
      `L ${tip} 0`,
      `L ${0} ${hh}`,
      `L ${0} ${shaft / 2}`,
      `L ${-hw} ${shaft / 2}`,
      'Z',
    ].join(' '),
  };
}

function chevron(width: number, height: number): ShapeGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const inset = Math.min(width * 0.22, height * 0.45);
  return {
    fillPath: `M ${-hw} ${-hh} L ${-hw + inset} ${-hh} L ${hw} 0 L ${-hw + inset} ${hh} L ${-hw} ${hh} L ${-inset} 0 Z`,
  };
}

function pointer(width: number, height: number): ShapeGeometry {
  const hw = width / 2;
  const hh = height / 2;
  return { fillPath: `M ${-hw} ${-hh} L ${hw} 0 L ${-hw} ${hh} Z` };
}

export function getShapeGeometry(
  kind: ShapeKind,
  width: number,
  height: number,
  curve = 0.35,
): ShapeGeometry {
  switch (kind) {
    case 'arrow': return straightArrow(width);
    case 'double-arrow': return straightArrow(width, true);
    case 'curved-arrow': return curvedArrow(width, height, curve);
    case 'elbow-arrow': return elbowArrow(width, height);
    case 'block-arrow': return blockArrow(width, height);
    case 'chevron': return chevron(width, height);
    case 'pointer': return pointer(width, height);
    default: return {};
  }
}
