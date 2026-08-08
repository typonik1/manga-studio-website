import type { HistorySnapshot, ImageDocument, MaskElement } from '@/types';

function addUrl(urls: Set<string>, value: string | null | undefined) {
  if (value?.startsWith('blob:')) urls.add(value);
}

function collectElements(urls: Set<string>, elements: MaskElement[] | undefined) {
  for (const element of elements ?? []) {
    if (element.type === 'bitmap') addUrl(urls, element.src);
  }
}

function collectSnapshotUrls(urls: Set<string>, snapshot: HistorySnapshot) {
  addUrl(urls, snapshot.cleanup.committed);
  for (const layer of snapshot.aiLayers ?? []) {
    addUrl(urls, layer.src);
    collectElements(urls, layer.eraseElements);
  }
  collectElements(urls, snapshot.baseLayer?.eraseElements);
  for (const mask of snapshot.masks ?? []) collectElements(urls, mask.elements);
  for (const watermark of snapshot.watermarks ?? []) addUrl(urls, watermark.imageSrc);
}

function collectCurrentDocumentUrls(urls: Set<string>, doc: ImageDocument) {
  addUrl(urls, doc.originalSrc);
  addUrl(urls, doc.cleanup?.committed);
  for (const layer of doc.aiLayers ?? []) {
    addUrl(urls, layer.src);
    collectElements(urls, layer.eraseElements);
  }
  collectElements(urls, doc.baseLayer?.eraseElements);
  for (const mask of doc.masks ?? []) collectElements(urls, mask.elements);
  for (const watermark of doc.watermarks ?? []) addUrl(urls, watermark.imageSrc);
}

export function collectDocumentObjectUrls(documents: ImageDocument[]): Set<string> {
  const urls = new Set<string>();
  for (const doc of documents) {
    collectCurrentDocumentUrls(urls, doc);
    for (const snapshot of [...(doc.past ?? []), ...(doc.future ?? [])]) collectSnapshotUrls(urls, snapshot);
  }
  return urls;
}

function setsEqual(first: Set<string>, second: Set<string>): boolean {
  if (first.size !== second.size) return false;
  for (const value of first) if (!second.has(value)) return false;
  return true;
}

/** Cheap guard that avoids rescanning every history snapshot on visual-only ticks. */
export function documentObjectUrlReferencesChanged(previous: ImageDocument[], next: ImageDocument[]): boolean {
  if (previous === next) return false;
  if (previous.length !== next.length) return true;
  const previousById = new Map(previous.map(document => [document.id, document]));
  for (const nextDocument of next) {
    const previousDocument = previousById.get(nextDocument.id);
    if (!previousDocument) return true;
    if (previousDocument === nextDocument) continue;
    // A changed history can add a new retained URL or evict the last reference.
    if (previousDocument.past !== nextDocument.past || previousDocument.future !== nextDocument.future) return true;
    const before = new Set<string>();
    const after = new Set<string>();
    collectCurrentDocumentUrls(before, previousDocument);
    collectCurrentDocumentUrls(after, nextDocument);
    if (!setsEqual(before, after)) return true;
  }
  return false;
}

/** Revoke only URLs that disappeared from both current state and undo history. */
export function revokeUnusedDocumentObjectUrls(
  previous: ImageDocument[],
  next: ImageDocument[],
  revoke: (url: string) => void = url => URL.revokeObjectURL(url),
): string[] {
  const before = collectDocumentObjectUrls(previous);
  const after = collectDocumentObjectUrls(next);
  const revoked: string[] = [];
  for (const url of before) {
    if (after.has(url)) continue;
    revoke(url);
    revoked.push(url);
  }
  return revoked;
}
