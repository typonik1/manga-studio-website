export interface StrokeData {
  id: string;
  points: number[]; // [x0,y0,x1,y1,...] normalized 0..1 relative to image
  size: number;     // fraction of image height
  color: string;
  opacity: number;
  /** Paint is the default for documents created before eraser support. */
  mode?: 'paint' | 'erase';
  purpose?: 'paint' | 'mask';
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
  committed: string | null; // legacy dataURL kept for older documents
  strokes: StrokeData[];
}

export type MaskElement =
  | { type: 'brush'; stroke: StrokeData }
  | { type: 'polygon'; points: number[]; mode?: 'add' | 'erase' }
  | { type: 'bitmap'; src: string; mode?: 'add' | 'erase' };

export interface BaseLayerAdjustments {
  brightness: number; // 1 = neutral
  contrast: number;   // 1 = neutral
  saturation: number; // 1 = neutral
}

/** Non-destructive transform shared by raster layers (base + AI). x/y are normalized to doc size. */
export interface LayerTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
}

export const DEFAULT_LAYER_TRANSFORM: LayerTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };

export interface BaseLayerState {
  id: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  eraseElements: MaskElement[];
  adjustments: BaseLayerAdjustments;
  /** Non-destructive crop, normalized to doc size. */
  crop?: CropRect | null;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export const DEFAULT_BASE_ADJUSTMENTS: BaseLayerAdjustments = { brightness: 1, contrast: 1, saturation: 1 };

export function createBaseLayerState(documentId: string): BaseLayerState {
  return {
    id: `base-${documentId}`,
    visible: true,
    locked: true,
    opacity: 1,
    eraseElements: [],
    adjustments: { ...DEFAULT_BASE_ADJUSTMENTS },
    crop: null,
    ...DEFAULT_LAYER_TRANSFORM,
  };
}

export interface MaskLayer {
  id: string;
  name: string;
  strokes: StrokeData[]; // legacy mirror for existing documents
  elements: MaskElement[];
  visible: boolean;
  opacity: number;
  resultLayerId?: string;
}

export interface AiRasterLayer {
  id: string;
  name: string;
  src: string;
  visible: boolean;
  opacity: number;
  operation: 'cleanup' | 'remove-background' | 'duplicate' | 'local-cutout' | 'drawing';
  replacesBase?: boolean;
  maskId?: string;
  eraseElements?: MaskElement[];
  adjustments?: BaseLayerAdjustments;
  /** Non-destructive crop, normalized to doc size. */
  crop?: CropRect | null;
  locked?: boolean;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export type SelectedLayer = { id: string; type: 'base' | 'mask' | 'ai' };

/** A single entry in the document's unified z-order stack. */
export type LayerReference =
  | { type: 'base'; id: string }
  | { type: 'ai'; id: string }
  | { type: 'text'; id: string }
  | { type: 'watermark'; id: string }
  | { type: 'shape'; id: string };

export interface HistorySnapshot {
  cleanup: CleanupLayerState;
  baseLayer: BaseLayerState;
  masks: MaskLayer[];
  aiLayers: AiRasterLayer[];
  activeMaskId: string | null;
  selectedLayer: SelectedLayer | null;
  watermarks: WatermarkObject[];
  texts: TextObject[];
  shapes: ShapeObject[];
  layerOrder: LayerReference[];
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
  baseLayer: BaseLayerState;
  masks: MaskLayer[];
  aiLayers: AiRasterLayer[];
  activeMaskId: string | null;
  selectedLayer: SelectedLayer | null;
  watermarks: WatermarkObject[];
  texts: TextObject[];
  shapes: ShapeObject[];
  /** Unified z-order stack (bottom → top). Missing refs are appended on top at resolve time. */
  layerOrder?: LayerReference[];
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  hasChanges: boolean;
}

export type CleanupMethod = 'auto' | 'white' | 'background' | 'inpaint';
export type ActiveTool = 'select' | 'brush' | 'maskBrush' | 'eraser' | 'pan' | 'lasso' | 'rectSelect' | 'text' | 'watermark' | 'wand' | 'crop';

export type SelectionMode = 'replace' | 'add' | 'subtract';
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
  cleanupMethod: CleanupMethod;
  magicThreshold: number;
  selectionMode: SelectionMode;
  wandContiguous: boolean;
  /** Keep the active selection after applying an action (erase/fill/inpaint). */
  keepSelectionAfterAction: boolean;
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
