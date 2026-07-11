import { create } from 'zustand';
import type {
  ImageDocument,
  WatermarkObject,
  TextObject,
  StrokeData,
  SelectedObject,
  HistorySnapshot,
  ViewportState,
  WatermarkSettings,
  CleanupSettings,
  TextSettings,
  ExportSettings,
  LayerVisibility,
  ActiveTool,
  LeftTab,
} from '../types';

const MAX_HISTORY = 40;

const defaultWmSettings: WatermarkSettings = {
  type: 'text',
  text: '© Манга-студия',
  fontFamily: 'Russo One',
  fontSize: 0.06,
  fill: 'rgba(255,255,255,0.85)',
  imageSrc: null,
  imageWidth: 0.25,
  imageHeight: 0.12,
  opacity: 0.75,
  rotation: 0,
  batchMode: 'fixed',
  scatterOffsetPct: 10,
  scatterTiltDeg: 15,
};

const defaultCleanupSettings: CleanupSettings = {
  brushSize: 0.03,
  brushHardness: 0.8,
  brushColor: '#ffffff',
  inpaintRadius: 4,
  mode: 'brush',
  magicThreshold: 30,
};

const defaultTextSettings: TextSettings = {
  fontFamily: 'Russo One',
  fontSize: 0.06,
  fill: '#000000',
  stroke: '',
  strokeWidth: 2,
  shadowColor: 'transparent',
  shadowBlur: 0,
  lineHeight: 1.3,
  align: 'center',
  width: 0.35,
};

const defaultExportSettings: ExportSettings = {
  format: 'png',
  quality: 0.92,
};

function snap(doc: ImageDocument): HistorySnapshot {
  return {
    cleanup: { committed: doc.cleanup.committed, strokes: [...doc.cleanup.strokes] },
    watermarks: doc.watermarks.map(w => ({ ...w })),
    texts: doc.texts.map(t => ({ ...t })),
  };
}

function withHistory(doc: ImageDocument): ImageDocument {
  const snapshot = snap(doc);
  const past = [...doc.past, snapshot].slice(-MAX_HISTORY);
  return { ...doc, past, future: [], hasChanges: true };
}

export interface AppState {
  documents: ImageDocument[];
  activeDocIndex: number;
  activeTool: ActiveTool;
  leftTab: LeftTab;
  selectedObject: SelectedObject | null;
  wmSettings: WatermarkSettings;
  cleanupSettings: CleanupSettings;
  textSettings: TextSettings;
  exportSettings: ExportSettings;
  viewport: ViewportState;
  layerVisibility: LayerVisibility;
  showExportModal: boolean;
  isInpaintRunning: boolean;
  inpaintProgress: number;

  addDocuments: (docs: ImageDocument[]) => void;
  removeDocument: (id: string) => void;
  setActiveDoc: (index: number) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setLeftTab: (tab: LeftTab) => void;
  setSelectedObject: (obj: SelectedObject | null) => void;
  addStroke: (stroke: StrokeData) => void;
  addWatermark: (wm: WatermarkObject) => void;
  updateWatermark: (id: string, updates: Partial<WatermarkObject>) => void;
  deleteWatermark: (id: string) => void;
  batchApplyWatermark: () => void;
  addText: (text: TextObject) => void;
  updateText: (id: string, updates: Partial<TextObject>) => void;
  deleteText: (id: string) => void;
  updateWmSettings: (updates: Partial<WatermarkSettings>) => void;
  updateCleanupSettings: (updates: Partial<CleanupSettings>) => void;
  updateTextSettings: (updates: Partial<TextSettings>) => void;
  updateExportSettings: (updates: Partial<ExportSettings>) => void;
  setViewport: (vp: Partial<ViewportState>) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  toggleLayerVisibility: (layer: keyof LayerVisibility) => void;
  setShowExportModal: (show: boolean) => void;
  applyCleanupCommit: (dataURL: string) => void;
  clearCurrentDocument: () => void;
  setInpaintRunning: (running: boolean, progress?: number) => void;
}

export const useStore = create<AppState>((set, get) => ({
  documents: [],
  activeDocIndex: -1,
  activeTool: 'select',
  leftTab: 'watermark',
  selectedObject: null,
  wmSettings: defaultWmSettings,
  cleanupSettings: defaultCleanupSettings,
  textSettings: defaultTextSettings,
  exportSettings: defaultExportSettings,
  viewport: { x: 0, y: 0, scale: 1 },
  layerVisibility: { base: true, cleanup: true, watermarks: true, texts: true },
  showExportModal: false,
  isInpaintRunning: false,
  inpaintProgress: 0,

  addDocuments: (newDocs) =>
    set(state => {
      const all = [...state.documents, ...newDocs];
      const idx = state.documents.length === 0 ? 0 : state.activeDocIndex;
      return { documents: all, activeDocIndex: Math.max(0, idx) };
    }),

  removeDocument: (id) =>
    set(state => {
      const docs = state.documents.filter(d => d.id !== id);
      const idx = Math.min(Math.max(0, state.activeDocIndex), docs.length - 1);
      return { documents: docs, activeDocIndex: docs.length === 0 ? -1 : idx, selectedObject: null };
    }),

  setActiveDoc: (index) =>
    set({ activeDocIndex: index, selectedObject: null, viewport: { x: 0, y: 0, scale: 1 } }),

  setActiveTool: (tool) => set({ activeTool: tool }),
  setLeftTab: (tab) => set({ leftTab: tab }),
  setSelectedObject: (obj) => set({ selectedObject: obj }),

  addStroke: (stroke) =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const doc = docs[state.activeDocIndex];
      const withH = withHistory(doc);
      docs[state.activeDocIndex] = {
        ...withH,
        cleanup: { ...withH.cleanup, strokes: [...withH.cleanup.strokes, stroke] },
      };
      return { documents: docs };
    }),

  addWatermark: (wm) =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const withH = withHistory(docs[state.activeDocIndex]);
      docs[state.activeDocIndex] = { ...withH, watermarks: [...withH.watermarks, wm] };
      return { documents: docs };
    }),

  updateWatermark: (id, updates) =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const doc = { ...docs[state.activeDocIndex] };
      doc.watermarks = doc.watermarks.map(w => w.id === id ? { ...w, ...updates } : w);
      doc.hasChanges = true;
      docs[state.activeDocIndex] = doc;
      return { documents: docs };
    }),

  deleteWatermark: (id) =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const withH = withHistory(docs[state.activeDocIndex]);
      docs[state.activeDocIndex] = { ...withH, watermarks: withH.watermarks.filter(w => w.id !== id) };
      return { documents: docs, selectedObject: null };
    }),

  batchApplyWatermark: () => {
    const state = get();
    const { documents, activeDocIndex, wmSettings } = state;
    if (documents.length === 0) return;
    const activeDoc = documents[activeDocIndex] ?? documents[0];
    const existingBatch = activeDoc.watermarks.find(w => w.isBatch);
    const baseX = existingBatch?.x ?? 0.5;
    const baseY = existingBatch?.y ?? 0.85;
    const baseScaleX = existingBatch?.scaleX ?? 1;
    const baseScaleY = existingBatch?.scaleY ?? 1;
    const baseRot = existingBatch?.rotation ?? wmSettings.rotation;

    const newDocs = documents.map(doc => {
      let newDoc = withHistory(doc);
      const nonBatch = newDoc.watermarks.filter(w => !w.isBatch);
      let x = baseX, y = baseY, rotation = baseRot;

      if (wmSettings.batchMode === 'random') {
        const p = 0.1;
        x = p + Math.random() * (1 - 2 * p);
        y = p + Math.random() * (1 - 2 * p);
        rotation = Math.random() * 360;
      } else if (wmSettings.batchMode === 'scattered') {
        const off = wmSettings.scatterOffsetPct / 100;
        x = Math.max(0.05, Math.min(0.95, baseX + (Math.random() - 0.5) * 2 * off));
        y = Math.max(0.05, Math.min(0.95, baseY + (Math.random() - 0.5) * 2 * off));
        rotation = baseRot + (Math.random() - 0.5) * 2 * wmSettings.scatterTiltDeg;
      }

      const batchWm: WatermarkObject = {
        id: `wm-batch-${doc.id}`,
        type: wmSettings.type,
        text: wmSettings.text,
        fontFamily: wmSettings.fontFamily,
        fontSize: wmSettings.fontSize,
        fill: wmSettings.fill,
        imageSrc: wmSettings.imageSrc ?? undefined,
        imageWidth: wmSettings.imageWidth,
        imageHeight: wmSettings.imageHeight,
        x, y,
        scaleX: baseScaleX,
        scaleY: baseScaleY,
        rotation,
        opacity: wmSettings.opacity,
        visible: true,
        isBatch: true,
      };
      return { ...newDoc, watermarks: [...nonBatch, batchWm] };
    });
    set({ documents: newDocs });
  },

  addText: (text) =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const withH = withHistory(docs[state.activeDocIndex]);
      docs[state.activeDocIndex] = { ...withH, texts: [...withH.texts, text] };
      return { documents: docs };
    }),

  updateText: (id, updates) =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const doc = { ...docs[state.activeDocIndex] };
      doc.texts = doc.texts.map(t => t.id === id ? { ...t, ...updates } : t);
      doc.hasChanges = true;
      docs[state.activeDocIndex] = doc;
      return { documents: docs };
    }),

  deleteText: (id) =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const withH = withHistory(docs[state.activeDocIndex]);
      docs[state.activeDocIndex] = { ...withH, texts: withH.texts.filter(t => t.id !== id) };
      return { documents: docs, selectedObject: null };
    }),

  updateWmSettings: (u) => set(s => ({ wmSettings: { ...s.wmSettings, ...u } })),
  updateCleanupSettings: (u) => set(s => ({ cleanupSettings: { ...s.cleanupSettings, ...u } })),
  updateTextSettings: (u) => set(s => ({ textSettings: { ...s.textSettings, ...u } })),
  updateExportSettings: (u) => set(s => ({ exportSettings: { ...s.exportSettings, ...u } })),

  setViewport: (vp) => set(s => ({ viewport: { ...s.viewport, ...vp } })),

  pushHistory: () =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      docs[state.activeDocIndex] = withHistory(docs[state.activeDocIndex]);
      return { documents: docs };
    }),

  undo: () =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const doc = docs[state.activeDocIndex];
      if (doc.past.length === 0) return {};
      const past = [...doc.past];
      const snapshot = past.pop()!;
      const current: HistorySnapshot = { cleanup: doc.cleanup, watermarks: [...doc.watermarks], texts: [...doc.texts] };
      const future = [current, ...doc.future].slice(0, MAX_HISTORY);
      docs[state.activeDocIndex] = { ...doc, ...snapshot, past, future };
      return { documents: docs, selectedObject: null };
    }),

  redo: () =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const doc = docs[state.activeDocIndex];
      if (doc.future.length === 0) return {};
      const future = [...doc.future];
      const snapshot = future.shift()!;
      const current: HistorySnapshot = { cleanup: doc.cleanup, watermarks: [...doc.watermarks], texts: [...doc.texts] };
      const past = [...doc.past, current].slice(-MAX_HISTORY);
      docs[state.activeDocIndex] = { ...doc, ...snapshot, past, future };
      return { documents: docs, selectedObject: null };
    }),

  toggleLayerVisibility: (layer) =>
    set(s => ({ layerVisibility: { ...s.layerVisibility, [layer]: !s.layerVisibility[layer] } })),

  setShowExportModal: (show) => set({ showExportModal: show }),

  applyCleanupCommit: (dataURL) =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const withH = withHistory(docs[state.activeDocIndex]);
      docs[state.activeDocIndex] = { ...withH, cleanup: { committed: dataURL, strokes: [] } };
      return { documents: docs };
    }),

  clearCurrentDocument: () =>
    set(state => {
      if (state.activeDocIndex < 0) return {};
      const docs = [...state.documents];
      const doc = docs[state.activeDocIndex];
      const withH = withHistory(doc);
      docs[state.activeDocIndex] = {
        ...withH,
        cleanup: { committed: null, strokes: [] },
        watermarks: [],
        texts: [],
        hasChanges: false,
      };
      return { documents: docs, selectedObject: null };
    }),

  setInpaintRunning: (running, progress = 0) =>
    set({ isInpaintRunning: running, inpaintProgress: progress }),
}));
