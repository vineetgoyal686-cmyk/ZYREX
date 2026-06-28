const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
  return entry.data;
}

function set(key, data, ttlMs) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function bust(key) {
  store.delete(key);
}

function bustPrefix(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

module.exports = { get, set, bust, bustPrefix };
