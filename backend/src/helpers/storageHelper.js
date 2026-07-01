const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

const decodePath = (path) => {
  try { return decodeURIComponent(path); } catch { return path; }
};

const normalizeStoragePath = (value, bucket) => {
  const raw = String(value || "").trim();
  if (!raw || /^data:|^blob:/i.test(raw)) return raw;

  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
  ];

  for (const marker of markers) {
    const idx = raw.indexOf(marker);
    if (idx >= 0) {
      return decodePath(raw.slice(idx + marker.length).split("?")[0]);
    }
  }

  let path = raw.split("?")[0].replace(/^\/+/, "");
  if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
  return decodePath(path);
};

const uploadStorageFile = async (client, bucket, path, buffer, mimetype) => {
  const { error } = await client.storage
    .from(bucket)
    .upload(path, buffer, { contentType: mimetype, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
};

const createSignedStorageUrl = async (
  client,
  bucket,
  value,
  expiresIn = DEFAULT_SIGNED_URL_TTL_SECONDS,
  { download = false } = {}
) => {
  const path = normalizeStoragePath(value, bucket);
  if (!path || /^data:|^blob:/i.test(path)) return path || "";

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn, { download });

    // All our buckets are private — a public-URL fallback here would just
    // produce a dead link (403) that still looks "truthy" to callers, so
    // a missing/failed file must resolve to "" instead.
    if (error || !data?.signedUrl) return "";
    return data.signedUrl;
  } catch (err) {
    return "";
  }
};

const removeStorageFile = async (client, bucket, value) => {
  const path = normalizeStoragePath(value, bucket);
  if (!path || /^data:|^blob:/i.test(path)) return;
  await client.storage.from(bucket).remove([path]);
};

const getPublicStorageUrl = (client, bucket, value) => {
  const path = normalizeStoragePath(value, bucket);
  if (!path || /^data:|^blob:/i.test(path)) return path || "";
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};

module.exports = {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  normalizeStoragePath,
  uploadStorageFile,
  createSignedStorageUrl,
  removeStorageFile,
  getPublicStorageUrl,
};
