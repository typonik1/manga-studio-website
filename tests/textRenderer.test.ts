import { describe, expect, it } from 'vitest';
import type { TextObject } from '@/types';
import { createTextNodeConfig } from '@/utils/textRenderer';

const text: TextObject = {
  id: 'text-1',
  text: 'Очень длинная строка текста для переноса по словам',
  fontFamily: 'Arial',
  fontSize: 0.1,
  fill: '#123456',
  stroke: '#ffffff',
  strokeWidth: 6,
  shadowColor: '#000000',
  shadowBlur: 8,
  lineHeight: 1.25,
  align: 'center',
  width: 0.2,
  x: 0.25,
  y: 0.3,
  scaleX: 1.2,
  scaleY: 0.9,
  rotation: 12,
  visible: true,
};

describe('shared text renderer', () => {
  it('maps normalized document units and pixel effects to a preview scale', () => {
    expect(createTextNodeConfig(text, 2000, 1000, 0.5)).toMatchObject({
      x: 250,
      y: 150,
      width: 200,
      fontSize: 50,
      strokeWidth: 3,
      shadowBlur: 4,
      align: 'center',
      lineHeight: 1.25,
      scaleX: 1.2,
      scaleY: 0.9,
      rotation: 12,
    });
  });

  it('asks the shared Konva renderer for word wrapping and top alignment', () => {
    expect(createTextNodeConfig(text, 2000, 1000, 1)).toMatchObject({
      width: 400,
      wrap: 'word',
      verticalAlign: 'top',
      align: 'center',
    });
  });
});
