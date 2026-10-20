// Apple's genre tree:
//   https://itunes.apple.com/WebObjects/MZStoreServices.woa/ws/genres?id=36
// Shape: { "36": { id, name, subgenres: { "6014": { id, name, subgenres: {...} } } } }

import { config } from '../config.js';

export const ROOT_GENRE_ID = 36;

export function buildGenreTreeUrl(rootId = ROOT_GENRE_ID, baseUrl = config.appleBaseUrl) {
  return `${baseUrl}/WebObjects/MZStoreServices.woa/ws/genres?id=${rootId}`;
}

/** Flatten the tree into [{ id, name, parentId }]. Throws on an unusable body. */
export function parseGenreTree(body) {
  const json = JSON.parse(body);
  const out = [];

  const walk = (node, key, parentId) => {
    if (!node || typeof node !== 'object') return;
    const id = Number(node.id ?? key);
    if (!Number.isInteger(id) || !node.name) return;
    out.push({ id, name: node.name, parentId });
    for (const [childKey, child] of Object.entries(node.subgenres ?? {})) {
      walk(child, childKey, id);
    }
  };

  for (const [key, node] of Object.entries(json ?? {})) walk(node, key, null);
  if (out.length === 0) throw new Error('genre tree contained no genres');
  return out;
}
