const express = require("express");
const path = require("path");
const router = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { createSignedStorageUrl } = require("../helpers/storageHelper");

console.log("✅ VIEW ROUTE LOADED");

const BUCKET = "models-3d";

/* =========================================
   1) GET MAIN GLTF (PROJECT BASED)
   Returns the public Supabase URL for the
   project's .gltf file so the frontend can
   load it directly (all relative refs like
   .bin and Textures/ resolve automatically
   against the Supabase Storage base path).
========================================= */
router.get("/model/:project", async (req, res) => {
  try {
    const { project } = req.params;

    // List files in models-3d/{project}/
    const { data: files, error } = await supabase.storage
      .from(BUCKET)
      .list(project, { limit: 200 });

    if (error) throw error;
    if (!files || files.length === 0) {
      return res.status(404).json({ message: "No model files found for this project" });
    }

    const gltfFile = files.find(f => f.name.toLowerCase().endsWith(".gltf"));
    if (!gltfFile) {
      return res.status(404).json({ message: "GLTF file not found in models-3d bucket" });
    }

    // Build public URL — Supabase resolves relative .bin / Textures/ refs automatically
    const gltfPath = `${project}/${gltfFile.name}`;
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(gltfPath);
    if (downloadError) throw downloadError;

    const gltfJson = JSON.parse(await fileData.text());
    const signRelativeUri = async (uri) => {
      if (!uri || /^(data:|https?:)/i.test(uri)) return uri;
      const objectPath = path.posix.normalize(path.posix.join(project, uri));
      return createSignedStorageUrl(supabase, BUCKET, objectPath);
    };

    gltfJson.buffers = await Promise.all((gltfJson.buffers || []).map(async buffer => ({
      ...buffer,
      uri: await signRelativeUri(buffer.uri),
    })));
    gltfJson.images = await Promise.all((gltfJson.images || []).map(async image => ({
      ...image,
      uri: await signRelativeUri(image.uri),
    })));

    const gltfDataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(gltfJson)).toString("base64")}`;

    return res.json({
      project,
      gltf: gltfDataUri,
      fileName: gltfFile.name,
    });

  } catch (err) {
    console.error("GLTF ERROR:", err.message);
    res.status(500).json({ message: "GLTF load error: " + err.message });
  }
});

module.exports = router;
