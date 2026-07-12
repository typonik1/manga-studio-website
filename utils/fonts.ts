import { MANGA_FONTS } from '../types';

/**
 * Fonts linked from Google Fonts only download when the browser sees DOM text
 * using them. Konva draws on <canvas>, which never triggers that download —
 * so we explicitly force-load every manga font via the CSS Font Loading API.
 */
export async function preloadGoogleFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const sample = 'АБВabc123';
  const loads = MANGA_FONTS
    .filter(f => !['Arial', 'Times New Roman', 'Georgia'].includes(f))
    .map(f =>
      document.fonts.load(`16px "${f}"`, sample).catch(() => [])
    );
  await Promise.allSettled(loads);
  try {
    await document.fonts.ready;
  } catch {
    // ignore
  }
}

/* ---------- Custom font persistence (IndexedDB) ---------- */

const DB_NAME = 'manga-studio-fonts';
const STORE = 'fonts';

interface StoredFont {
  name: string;
  data: ArrayBuffer;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Register a font with the browser so both DOM and canvas can use it */
async function registerFont(name: string, data: ArrayBuffer): Promise<void> {
  const face = new FontFace(name, data);
  const loaded = await face.load();
  (document.fonts as unknown as { add: (f: FontFace) => void }).add(loaded);
}

/** Save an uploaded custom font to IndexedDB and register it immediately */
export async function saveCustomFont(name: string, data: ArrayBuffer): Promise<void> {
  await registerFont(name, data);
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ name, data } satisfies StoredFont);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Load all previously saved custom fonts; returns their names */
export async function loadSavedCustomFonts(): Promise<string[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openDB();
    const fonts = await new Promise<StoredFont[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as StoredFont[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const names: string[] = [];
    for (const f of fonts) {
      try {
        await registerFont(f.name, f.data);
        names.push(f.name);
      } catch {
        // skip corrupted font
      }
    }
    return names;
  } catch {
    return [];
  }
}

/** Delete a saved custom font */
export async function deleteCustomFont(name: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}
