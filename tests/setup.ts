// Node 25 exposes an incomplete experimental localStorage unless it receives
// --localstorage-file. Tests need browser semantics independent of Node flags.
const values = new Map<string, string>();
const storage: Storage = {
  get length() { return values.size; },
  clear: () => values.clear(),
  getItem: key => values.get(String(key)) ?? null,
  key: index => [...values.keys()][index] ?? null,
  removeItem: key => { values.delete(String(key)); },
  setItem: (key, value) => { values.set(String(key), String(value)); },
};

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
