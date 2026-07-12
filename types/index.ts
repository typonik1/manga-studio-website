export interface StrokeData {
  id: string;
  points: number[]; // [x0,y0,x1,y1,...] normalized 0..1 relative to image
  size: number;     // fraction of image height
  color: string;
  opacity: number;
  /** Paint is the default for documents created before eraser support. */
  mode?: 'paint' | 'erase';
}

export interface WatermarkObject {
  id: string;
  type: 'text' | 'image';
  text?: string;
  fontFamily?: string;
  fontSize?: number;    // fraction of image height
  fill?: string;
  imageSrc?: string;    // dataURL
  imageWidth?: number;  // fraction of image width
  imageHeight?: number; // fraction of image height
  x: number;           // normalized top-left x
  y: number;           // normalized top-left y
  scaleX: number;
  scaleY: number;
  rotation: number;    // degrees
  opacity: number;     // 0..1
  visible: boolean;
  isBatch: boolean;
}

export interface TextObject {
  id: string;
  text: string;
  fontFamily: string;
  fontSize: number;     // fraction of image height
  fill: string;
  stroke: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  width: number;        // fraction of image width
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  visible: boolean;
  /** OCR text exactly as it was seen before translation. */
  sourceText?: string;
  /** Identifies text created by a page auto-translation run. */
  translationBatchId?: string;
  /** Whether this object is currently showing its translated value. */
  isTranslated?: boolean;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'star';

export interface ShapeObject {
  id: string;
  kind: ShapeKind;
  x: number;        // normalized center x
  y: number;        // normalized center y
  width: number;    // normalized fraction of image width
  height: number;   // normalized fraction of image height
  fill: string;     // '' = no fill
  stroke: string;
  strokeWidth: number; // px at original resolution
  opacity: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  cornerRadius: number; // for rect, px at original resolution
  visible: boolean;
}

export interface CleanupLayerState {
  committed: string | null; // dataURL of committed cleanup at original res
  strokes: StrokeData[];
}

export interface HistorySnapshot {
  cleanup: CleanupLayerState;
  watermarks: WatermarkObject[];
  texts: TextObject[];
  shapes: ShapeObject[];
}

export interface ImageDocument {
  id: string;
  file: File;
  originalSrc: string;  // blob URL
  thumbnail: string;    // small dataURL
  width: number;
  height: number;
  name: string;
  cleanup: CleanupLayerState;
  watermarks: WatermarkObject[];
  texts: TextObject[];
  shapes: ShapeObject[];
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  hasChanges: boolean;
}

export type ActiveTool = 'select' | 'brush' | 'eraser' | 'pan' | 'lasso' | 'text' | 'watermark' | 'wand' | 'crop';
export type LeftTab = 'watermark' | 'cleanup' | 'text' | 'insert' | 'transform';

export interface SelectedObject {
  id: string;
  type: 'watermark' | 'text' | 'shape';
}

export interface CropRect {
  x: number; // normalized
  y: number;
  width: number;
  height: number;
}

export interface ShapeSettings {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  cornerRadius: number;
}

export interface WatermarkSettings {
  type: 'text' | 'image';
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  imageSrc: string | null;
  imageWidth: number;
  imageHeight: number;
  opacity: number;
  rotation: number;
  batchMode: 'fixed' | 'random' | 'scattered';
  scatterOffsetPct: number;
  scatterTiltDeg: number;
}

export interface CleanupSettings {
  brushSize: number;
  brushHardness: number;
  brushColor: string;
  inpaintRadius: number;
  mode: 'brush' | 'inpaint' | 'magic';
  magicThreshold: number;
}

export interface TextSettings {
  fontFamily: string;
  fontSize: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  width: number;
}

export interface ExportSettings {
  format: 'png' | 'jpg';
  quality: number;
}

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

export interface LayerVisibility {
  base: boolean;
  cleanup: boolean;
  watermarks: boolean;
  texts: boolean;
  shapes: boolean;
}

export const MANGA_FONTS = [
  'Russo One',
  'Neucha',
  'Marck Script',
  'Caveat',
  'Amatic SC',
  'Bad Script',
  'Pangolin',
  'Yanone Kaffeesatz',
  'Rubik Mono One',
  'Press Start 2P',
  'Lobster',
  'Arial',
  'Times New Roman',
  'Georgia',
];

export const TEXT_PRESETS: Record<string, Partial<TextSettings>> = {
  'Манга-бабл': {
    fontFamily: 'Neucha',
    fill: '#000000',
    stroke: '',
    strokeWidth: 0,
    shadowBlur: 0,
    fontSize: 0.055,
    align: 'center',
  },
  'Крик': {
    fontFamily: 'Russo One',
    fill: '#ffffff',
    stroke: '#cc0000',
    strokeWidth: 4,
    shadowBlur: 0,
    fontSize: 0.09,
    align: 'center',
  },
  'Сабы': {
    fontFamily: 'Arial',
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidth: 3,
    shadowBlur: 0,
    fontSize: 0.05,
    align: 'center',
  },
  'Неон': {
    fontFamily: 'Russo One',
    fill: '#00ffff',
    stroke: '',
    strokeWidth: 0,
    shadowColor: '#00ffff',
    shadowBlur: 18,
    fontSize: 0.065,
    align: 'center',
  },
};
