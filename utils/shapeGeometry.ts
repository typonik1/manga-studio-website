import type { ShapeKind } from '@/types';

export interface ShapeGeometry {
  strokePath?: string;
  fillPath?: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function arrowHead(x: number, y: number, angle: number, length: number, width: number) {
  const baseX = x - Math.cos(angle) * length;
  const baseY = y - Math.sin(angle) * length;
  const perpX = -Math.sin(angle) * width / 2;
  const perpY = Math.cos(angle) * width / 2;
  return [
    `M ${x} ${y}`,
    `L ${baseX + perpX} ${baseY + perpY}`,
    `L ${baseX - perpX} ${baseY - perpY}`,
    'Z',
  ].join(' ');
}

function straightArrow(width: number, height: number, doubleEnded = false): ShapeGeometry {
  const x1 = -width / 2, x2 = width / 2;
  const headLength = Math.max(10, Math.min(width * 0.22, 32));
  const headWidth = Math.max(8, Math.min(height * 0.9, 64));
  const strokePath = `M ${x1} 0 L ${x2} 0`;
  const end = arrowHead(x2, 0, 0, headLength, headWidth);
  if (!doubleEnded) return { strokePath, fillPath: end };
  return {
    strokePath,
    fillPath: `${end} ${arrowHead(x1, 0, Math.PI, headLength, headWidth)}`,
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
  const headLength = Math.max(10, Math.min(width * 0.2, 32));
  const headWidth = Math.max(8, Math.min(height * 0.5, 48));
  return {
    strokePath: `M ${x1} 0 Q 0 ${controlY} ${x2} 0`,
    fillPath: arrowHead(tipX, tipY, angle, headLength, headWidth),
  };
}

function elbowArrow(width: number, height: number): ShapeGeometry {
  const x1 = -width / 2;
  const x2 = width / 2;
  const y = height * 0.28;
  return {
    strokePath: `M ${x1} ${y} L 0 ${y} L 0 ${-y} L ${x2} ${-y}`,
    fillPath: arrowHead(
      x2,
      -y,
      0,
      Math.max(10, Math.min(width * 0.2, 32)),
      Math.max(8, Math.min(height * 0.5, 48)),
    ),
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

function roundedRect(width: number, height: number, radius: number): ShapeGeometry {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.max(0, Math.min(radius, hw, hh));
  return {
    fillPath: [
      `M ${-hw + r} ${-hh}`,
      `L ${hw - r} ${-hh}`,
      `Q ${hw} ${-hh} ${hw} ${-hh + r}`,
      `L ${hw} ${hh - r}`,
      `Q ${hw} ${hh} ${hw - r} ${hh}`,
      `L ${-hw + r} ${hh}`,
      `Q ${-hw} ${hh} ${-hw} ${hh - r}`,
      `L ${-hw} ${-hh + r}`,
      `Q ${-hw} ${-hh} ${-hw + r} ${-hh}`,
      'Z',
    ].join(' '),
  };
}

function ellipse(width: number, height: number): ShapeGeometry {
  const rx = width / 2;
  const ry = height / 2;
  return {
    fillPath: `M ${-rx} 0 A ${rx} ${ry} 0 1 0 ${rx} 0 A ${rx} ${ry} 0 1 0 ${-rx} 0 Z`,
  };
}

function star(width: number, height: number): ShapeGeometry {
  const outer = Math.min(width, height) / 2;
  const inner = outer / 2;
  const parts: string[] = [];
  for (let index = 0; index < 10; index++) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = Math.PI / 5 * index - Math.PI / 2;
    parts.push(`${index === 0 ? 'M' : 'L'} ${Math.cos(angle) * radius} ${Math.sin(angle) * radius}`);
  }
  return { fillPath: `${parts.join(' ')} Z` };
}

export function getShapeGeometry(
  kind: ShapeKind,
  width: number,
  height: number,
  curve = 0.35,
  cornerRadius = 0,
): ShapeGeometry {
  switch (kind) {
    case 'rect': return roundedRect(width, height, cornerRadius);
    case 'ellipse': return ellipse(width, height);
    case 'line': return { strokePath: `M ${-width / 2} 0 L ${width / 2} 0` };
    case 'star': return star(width, height);
    case 'arrow': return straightArrow(width, height);
    case 'double-arrow': return straightArrow(width, height, true);
    case 'curved-arrow': return curvedArrow(width, height, curve);
    case 'elbow-arrow': return elbowArrow(width, height);
    case 'block-arrow': return blockArrow(width, height);
    case 'chevron': return chevron(width, height);
    case 'pointer': return pointer(width, height);
    default: return {};
  }
}
