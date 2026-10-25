var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_vite = require("vite");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");
var import_genai = require("@google/genai");
import_dotenv.default.config();
var db = null;
var RETOUCHED_DIR = import_path.default.join(process.cwd(), "data", "retouched");
var ALBUMS_DIR = import_path.default.join(process.cwd(), "data", "albums");
var CREDITS_STORE_FILE = import_path.default.join(process.cwd(), "data", "credits_store.json");
try {
  import_fs.default.mkdirSync(RETOUCHED_DIR, { recursive: true });
  import_fs.default.mkdirSync(ALBUMS_DIR, { recursive: true });
} catch (e) {
}
function loadCreditsStore() {
  const defaultUsers = {
    usr_admin_huyitcom: {
      uid: "usr_admin_huyitcom",
      email: "huyitcom@gmail.com",
      displayName: "L\xEA Kh\u1EAFc Huy",
      photoURL: null,
      role: "admin",
      credits: 25,
      renderCount: 0,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastLoginAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
  try {
    if (import_fs.default.existsSync(CREDITS_STORE_FILE)) {
      const raw = import_fs.default.readFileSync(CREDITS_STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        users: { ...defaultUsers, ...parsed.users || {} },
        orders: parsed.orders || {},
        renderLogs: Array.isArray(parsed.renderLogs) ? parsed.renderLogs : []
      };
    }
  } catch (err) {
    console.warn("[CreditsStore] Error reading credits_store.json:", err);
  }
  return {
    users: defaultUsers,
    orders: {},
    renderLogs: []
  };
}
function saveCreditsStore(store) {
  try {
    import_fs.default.mkdirSync(import_path.default.dirname(CREDITS_STORE_FILE), { recursive: true });
    import_fs.default.writeFileSync(CREDITS_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("[CreditsStore] Error writing credits_store.json:", err);
  }
}
var creditsStore = loadCreditsStore();
saveCreditsStore(creditsStore);
function loadAlbumFromDisk(folderId) {
  try {
    const filePath = import_path.default.join(ALBUMS_DIR, `${folderId}.json`);
    if (import_fs.default.existsSync(filePath)) {
      const raw = import_fs.default.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[Disk] Error reading album ${folderId}:`, err);
  }
  return { selectedIds: [], annotations: {}, retouched: {} };
}
function saveAlbumToDisk(folderId, data) {
  try {
    import_fs.default.mkdirSync(ALBUMS_DIR, { recursive: true });
    const filePath = import_path.default.join(ALBUMS_DIR, `${folderId}.json`);
    import_fs.default.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn(`[Disk] Error writing album ${folderId}:`, err);
  }
}
var retouchedMemoryBuffers = /* @__PURE__ */ new Map();
function saveRetouchedImage(folderId, fileId, dataUrlOrUrl) {
  if (!dataUrlOrUrl) return "";
  if (!dataUrlOrUrl.startsWith("data:image/")) {
    return dataUrlOrUrl;
  }
  try {
    const match = dataUrlOrUrl.match(/^data:([a-zA-Z0-9\/+.-]+);base64,(.+)$/);
    if (!match) return dataUrlOrUrl;
    const mimeType = match[1] || "image/jpeg";
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");
    const folderDir = import_path.default.join(RETOUCHED_DIR, folderId);
    import_fs.default.mkdirSync(folderDir, { recursive: true });
    const filePath = import_path.default.join(folderDir, `${fileId}.jpg`);
    import_fs.default.writeFileSync(filePath, buffer);
    const cacheKey = `${folderId}_${fileId}`;
    retouchedMemoryBuffers.set(cacheKey, { buffer, mimeType });
    return `/api/retouched-image/${folderId}/${fileId}?v=${Date.now()}`;
  } catch (err) {
    console.warn("Failed saving retouched image to disk:", err);
    return dataUrlOrUrl;
  }
}
function getDb() {
  if (db) return db;
  const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountStr) {
    throw new Error("Database not configured on server");
  }
  try {
    const serviceAccount = JSON.parse(serviceAccountStr);
    if ((0, import_app.getApps)().length === 0) {
      (0, import_app.initializeApp)({
        credential: (0, import_app.cert)(serviceAccount)
      });
    }
    db = (0, import_firestore.getFirestore)();
    return db;
  } catch (error) {
    console.error("Error parsing FIREBASE_SERVICE_ACCOUNT or initializing Firebase Admin:", error);
    throw new Error("L\u1ED7i \u0111\u1ECDc c\u1EA5u h\xECnh FIREBASE_SERVICE_ACCOUNT tr\xEAn m\xE1y ch\u1EE7: " + error.message);
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
  const localAlbumsStore = {};
  const getSafeDb = () => {
    try {
      return getDb();
    } catch {
      return null;
    }
  };
  app.get("/api/albums/:folderId/selections", async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const folderId = req.params.folderId;
    const currentDb = getSafeDb();
    if (!localAlbumsStore[folderId]) {
      localAlbumsStore[folderId] = loadAlbumFromDisk(folderId);
    }
    let selectedIds = localAlbumsStore[folderId]?.selectedIds || [];
    let annotations = localAlbumsStore[folderId]?.annotations || {};
    let retouched = localAlbumsStore[folderId]?.retouched || {};
    if (currentDb) {
      try {
        const doc = await currentDb.collection("albums").doc(folderId).get();
        if (doc.exists) {
          const data = doc.data();
          if (data?.selectedIds && Array.isArray(data.selectedIds)) {
            selectedIds = Array.from(/* @__PURE__ */ new Set([...selectedIds, ...data.selectedIds]));
          }
          if (data?.annotations) {
            annotations = { ...annotations, ...data.annotations };
          }
          if (data?.retouched) {
            for (const [fId, val] of Object.entries(data.retouched)) {
              retouched[fId] = saveRetouchedImage(folderId, fId, val);
            }
          }
          localAlbumsStore[folderId] = { selectedIds, annotations, retouched };
          saveAlbumToDisk(folderId, localAlbumsStore[folderId]);
        }
      } catch (error) {
        console.warn("Could not fetch album data from Firestore, using disk store:", error);
      }
    }
    res.json({ selectedIds, annotations, retouched });
  });
  app.post("/api/albums/:folderId/selections", async (req, res) => {
    const folderId = req.params.folderId;
    const { selectedIds } = req.body;
    if (!Array.isArray(selectedIds)) {
      return res.status(400).json({ error: "selectedIds must be an array" });
    }
    if (!localAlbumsStore[folderId]) {
      localAlbumsStore[folderId] = loadAlbumFromDisk(folderId);
    }
    localAlbumsStore[folderId].selectedIds = selectedIds;
    saveAlbumToDisk(folderId, localAlbumsStore[folderId]);
    const currentDb = getSafeDb();
    if (currentDb) {
      try {
        await currentDb.collection("albums").doc(folderId).set({
          selectedIds,
          updatedAt: import_firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.warn("Failed saving selections to Firestore, stored on disk:", error);
      }
    }
    res.json({ success: true, selectedIds });
  });
  app.get("/api/albums/:folderId/annotations", async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const folderId = req.params.folderId;
    const currentDb = getSafeDb();
    if (!localAlbumsStore[folderId]) {
      localAlbumsStore[folderId] = loadAlbumFromDisk(folderId);
    }
    let annotations = localAlbumsStore[folderId]?.annotations || {};
    if (currentDb) {
      try {
        const doc = await currentDb.collection("albums").doc(folderId).get();
        if (doc.exists && doc.data()?.annotations) {
          annotations = { ...annotations, ...doc.data()?.annotations };
          localAlbumsStore[folderId].annotations = annotations;
          saveAlbumToDisk(folderId, localAlbumsStore[folderId]);
        }
      } catch (e) {
        console.warn("Error fetching annotations from Firestore, using disk:", e);
      }
    }
    res.json({ annotations });
  });
  app.post("/api/albums/:folderId/annotations", async (req, res) => {
    const folderId = req.params.folderId;
    const { annotations, fileId, fileAnnotations } = req.body;
    if (!localAlbumsStore[folderId]) {
      localAlbumsStore[folderId] = loadAlbumFromDisk(folderId);
    }
    if (!localAlbumsStore[folderId].annotations) {
      localAlbumsStore[folderId].annotations = {};
    }
    if (annotations && typeof annotations === "object") {
      localAlbumsStore[folderId].annotations = annotations;
    } else if (fileId && Array.isArray(fileAnnotations)) {
      if (fileAnnotations.length === 0) {
        delete localAlbumsStore[folderId].annotations[fileId];
      } else {
        localAlbumsStore[folderId].annotations[fileId] = fileAnnotations;
      }
    } else {
      return res.status(400).json({ error: "Invalid annotations payload" });
    }
    saveAlbumToDisk(folderId, localAlbumsStore[folderId]);
    const currentDb = getSafeDb();
    if (currentDb) {
      try {
        await currentDb.collection("albums").doc(folderId).set({
          annotations: localAlbumsStore[folderId].annotations,
          updatedAt: import_firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.warn("Failed saving annotations to Firestore, stored on disk:", error);
      }
    }
    res.json({ success: true, annotations: localAlbumsStore[folderId].annotations });
  });
  app.get("/api/albums/:folderId/retouched", async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const folderId = req.params.folderId;
    const currentDb = getSafeDb();
    if (!localAlbumsStore[folderId]) {
      localAlbumsStore[folderId] = loadAlbumFromDisk(folderId);
    }
    let retouched = localAlbumsStore[folderId]?.retouched || {};
    if (currentDb) {
      try {
        const doc = await currentDb.collection("albums").doc(folderId).get();
        if (doc.exists && doc.data()?.retouched) {
          retouched = { ...retouched };
          for (const [fId, val] of Object.entries(doc.data()?.retouched)) {
            retouched[fId] = saveRetouchedImage(folderId, fId, val);
          }
          localAlbumsStore[folderId].retouched = retouched;
          saveAlbumToDisk(folderId, localAlbumsStore[folderId]);
        }
      } catch (e) {
        console.warn("Error fetching retouched images from Firestore, using disk:", e);
      }
    }
    res.json({ retouched });
  });
  app.post("/api/albums/:folderId/retouched", async (req, res) => {
    const folderId = req.params.folderId;
    const { fileId, retouchedImageUrl } = req.body;
    if (!fileId || !retouchedImageUrl) {
      return res.status(400).json({ error: "fileId and retouchedImageUrl are required" });
    }
    const savedUrl = saveRetouchedImage(folderId, fileId, retouchedImageUrl);
    if (!localAlbumsStore[folderId]) {
      localAlbumsStore[folderId] = loadAlbumFromDisk(folderId);
    }
    if (!localAlbumsStore[folderId].retouched) {
      localAlbumsStore[folderId].retouched = {};
    }
    localAlbumsStore[folderId].retouched[fileId] = savedUrl;
    saveAlbumToDisk(folderId, localAlbumsStore[folderId]);
    const currentDb = getSafeDb();
    if (currentDb) {
      try {
        await currentDb.collection("albums").doc(folderId).set({
          retouched: localAlbumsStore[folderId].retouched,
          updatedAt: import_firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.warn("Failed saving retouched image to Firestore, stored on disk:", error);
      }
    }
    res.json({ success: true, retouched: localAlbumsStore[folderId].retouched, retouchedImageUrl: savedUrl });
  });
  app.get("/api/retouched-image/:folderId/:fileId", (req, res) => {
    const { folderId, fileId } = req.params;
    const cacheKey = `${folderId}_${fileId}`;
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="${fileId}_ai_retouched.jpg"`);
    }
    const cached = retouchedMemoryBuffers.get(cacheKey);
    if (cached) {
      res.setHeader("Content-Type", cached.mimeType || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      return res.send(cached.buffer);
    }
    const filePath = import_path.default.join(RETOUCHED_DIR, folderId, `${fileId}.jpg`);
    if (import_fs.default.existsSync(filePath)) {
      try {
        const buffer = import_fs.default.readFileSync(filePath);
        retouchedMemoryBuffers.set(cacheKey, { buffer, mimeType: "image/jpeg" });
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
        return res.send(buffer);
      } catch (e) {
        console.warn("Error reading retouched image:", e);
      }
    }
    res.status(404).json({ error: "Retouched image not found" });
  });
  app.post("/api/ai/retouch", async (req, res) => {
    try {
      const {
        folderId,
        fileId,
        imageBase64,
        mimeType = "image/jpeg",
        annotations = [],
        customPrompt,
        resolution = "2K"
      } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: "GEMINI_API_KEY ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh trong m\xF4i tr\u01B0\u1EDDng m\xE1y ch\u1EE7. Vui l\xF2ng ki\u1EC3m tra tab Settings > Secrets."
        });
      }
      if (!imageBase64) {
        return res.status(400).json({ error: "Thi\u1EBFu d\u1EEF li\u1EC7u h\xECnh \u1EA3nh (imageBase64)." });
      }
      const validResolution = resolution === "1K" || resolution === "2K" || resolution === "4K" ? resolution : "2K";
      const ai = new import_genai.GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
      let notesDescription = "Kh\xF4ng c\xF3 ghi ch\xFA c\u1EE5 th\u1EC3. H\xE3y t\u1EF1 \u0111\u1ED9ng t\u1ED1i \u01B0u \xE1nh s\xE1ng, l\xE0m m\u1ECBn da t\u1EF1 nhi\xEAn v\xE0 l\xE0m n\u1ED5i b\u1EADt ch\u1EE7 th\u1EC3 ch\xEDnh.";
      if (Array.isArray(annotations) && annotations.length > 0) {
        notesDescription = annotations.map((item, idx) => {
          let locationStr = "";
          if (Array.isArray(item.points) && item.points.length > 0) {
            const xs = item.points.map((p) => p.x).filter((x) => typeof x === "number");
            const ys = item.points.map((p) => p.y).filter((y) => typeof y === "number");
            if (xs.length > 0 && ys.length > 0) {
              const minX = Math.round(Math.min(...xs) * 100);
              const maxX = Math.round(Math.max(...xs) * 100);
              const minY = Math.round(Math.min(...ys) * 100);
              const maxY = Math.round(Math.max(...ys) * 100);
              const centerX = Math.round((minX + maxX) / 2);
              const centerY = Math.round((minY + maxY) / 2);
              locationStr = ` [V\u1ECB tr\xED khoanh \u0111\u1ECF: t\u1ECDa \u0111\u1ED9 t\xE2m kho\u1EA3ng ${centerX}% ngang, ${centerY}% d\u1ECDc t\u1EEB tr\xEAn xu\u1ED1ng; v\xF9ng bounding box: x t\u1EEB ${minX}% \u0111\u1EBFn ${maxX}%, y t\u1EEB ${minY}% \u0111\u1EBFn ${maxY}%]`;
            }
          }
          return `${idx + 1}. [Y\xEAu c\u1EA7u #${idx + 1}]: "${item.note || "Ch\u1EC9nh s\u1EEDa v\xF9ng n\xE0y"}"${locationStr}`;
        }).join("\n");
      }
      const prompt = `You are an elite, award-winning studio portrait and commercial photo retoucher for high-end photography studio 'Photobook Vietnam'.
Perform precise, localized photo inpainting and retouching directly on the provided photo based strictly on the client's circled markup requests below:

CLIENT RETOUCH REQUESTS & CIRCLED REGIONS:
${notesDescription}
${customPrompt ? `ADDITIONAL CLIENT REQUEST: ${customPrompt}` : ""}

CRITICAL RULES FOR REALISTIC WEDDING RETOUCHING (MANDATORY & ABSOLUTE):
1. LOCALIZED INPAINTING ONLY (PIXEL-LOCKED BASE):
   - ONLY edit the exact pixels inside each specified circled region.
   - All other 95%+ of the photograph MUST remain 100% pixel-identical to the original photo.
2. ABSOLUTE SKELETAL POSE, BODY LEAN & HEAD TILT LOCK:
   - NEVER alter, straighten, upright, or change the person's body posture, spine curvature, or leaning angle.
   - If the person is leaning/bending forward (e.g. leaning over a tea table), they MUST REMAIN leaning/bending forward at the EXACT same angle and degree! DO NOT make them stand straight or upright!
   - NEVER change the person's head tilt, neck angle, chin direction, or eye gaze! If they are looking downward at the table, their head MUST remain tilted downward and eyes looking downward!
3. ABSOLUTE IDENTITY & FACE PRESERVATION (STRICT & ZERO-ALTERATION):
   - CRITICAL: If a circled region does NOT circle a person's face or ask to retouch facial features, YOU MUST LEAVE ALL FACES 100% UNTOUCHED AND UNMODIFIED!
   - NEVER regenerate, redesign, reshape, or alter the eyes, pupils, eyebrows, nose, mouth, smile, teeth, or likeness of any adult or child in the photo.
   - Do NOT apply generic beautification or airbrush filters to faces! Do NOT make real human faces look like synthetic AI dolls, anime avatars, or plastic mannequins.
   - Maintain the EXACT original facial expression, teeth shape, smile lines, and authentic identity of each person.
4. MICRO-RETOUCH FOR STRAY HAIR & BLEMISHES:
   - When asked to remove a stray hair strand (e.g. 'x\xF3a t\xF3c th\u1EEBa n\xE0y \u0111i'), ONLY erase the individual hair strand pixels and replace them with natural skin/fabric behind it.
   - NEVER regenerate the entire head, hairstyle, hair bun, jawline, neck, or body posture just to remove a hair strand!
5. LOCALIZED OBJECT & PERSON REMOVAL:
   - When asked to remove an unwanted person or child (e.g. 'x\xF3a em b\xE9', 'x\xF3a ng\u01B0\u1EDDi n\xE0y'), ONLY inpaint and fill the background behind that specific person within the circled region.
   - ABSOLUTELY DO NOT re-render, change, or beautify the faces of the other people remaining in the photo!
6. CLOTHING & DRESS PRESERVATION:
   - NEVER alter the clothing neckline, dress straps, or dress style. Keep the dress neckline, fabric folds, lace, and seams EXACTLY as originally worn.
7. NATURAL PHOTOREALISM:
   - Seamlessly blend lighting, grain, shadows, and color temperature so no editing seams or AI artifacts appear.
   - Output the final image in high-resolution (${validResolution}) studio quality.`;
      let generatedImageUrl = null;
      const primaryModel = validResolution === "1K" ? "gemini-3.1-flash-lite-image" : "gemini-nano-banana-2.1";
      const fallbackModel = validResolution === "1K" ? "gemini-nano-banana-2.1" : "gemini-3-pro-image";
      let modelUsed = primaryModel;
      try {
        console.log(`[AI Retouch] Calling ${modelUsed} (${validResolution}) for fileId: ${fileId || "temp"} with ${annotations.length} notes...`);
        const requestParams = {
          model: primaryModel,
          contents: {
            parts: [
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType: mimeType || "image/jpeg"
                }
              },
              {
                text: prompt
              }
            ]
          }
        };
        if (primaryModel === "gemini-nano-banana-2.1" || primaryModel === "gemini-3-pro-image") {
          requestParams.config = {
            imageConfig: {
              imageSize: validResolution
            }
          };
        }
        const response = await ai.models.generateContent(requestParams);
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData?.data) {
            generatedImageUrl = `data:${part.inlineData.mimeType || "image/jpeg"};base64,${part.inlineData.data}`;
            break;
          }
        }
      } catch (firstError) {
        console.warn(`[AI Retouch] Primary model (${modelUsed}) failed:`, firstError?.message || firstError);
        try {
          modelUsed = fallbackModel;
          console.log(`[AI Retouch] Trying fallback model: ${modelUsed} (${validResolution})...`);
          const fallbackParams = {
            model: fallbackModel,
            contents: {
              parts: [
                {
                  inlineData: {
                    data: cleanBase64,
                    mimeType: mimeType || "image/jpeg"
                  }
                },
                {
                  text: prompt
                }
              ]
            }
          };
          if (fallbackModel === "gemini-nano-banana-2.1" || fallbackModel === "gemini-3-pro-image") {
            fallbackParams.config = {
              imageConfig: {
                imageSize: validResolution
              }
            };
          }
          const response = await ai.models.generateContent(fallbackParams);
          for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData?.data) {
              generatedImageUrl = `data:${part.inlineData.mimeType || "image/jpeg"};base64,${part.inlineData.data}`;
              break;
            }
          }
        } catch (fallbackError) {
          if (modelUsed !== "gemini-3.1-flash-lite-image") {
            try {
              modelUsed = "gemini-3.1-flash-lite-image";
              console.log(`[AI Retouch] Trying final fallback model: ${modelUsed}...`);
              const finalResponse = await ai.models.generateContent({
                model: "gemini-3.1-flash-lite-image",
                contents: {
                  parts: [
                    {
                      inlineData: {
                        data: cleanBase64,
                        mimeType: mimeType || "image/jpeg"
                      }
                    },
                    {
                      text: prompt
                    }
                  ]
                }
              });
              for (const part of finalResponse.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData?.data) {
                  generatedImageUrl = `data:${part.inlineData.mimeType || "image/jpeg"};base64,${part.inlineData.data}`;
                  break;
                }
              }
            } catch {
            }
          }
          if (!generatedImageUrl) {
            console.error(`[AI Retouch] Fallback model (${modelUsed}) also failed:`, fallbackError);
            const rawError = firstError?.message || fallbackError?.message || String(fallbackError);
            if (rawError.includes("prepayment credits") || rawError.includes("depleted") || rawError.includes("402")) {
              return res.status(402).json({
                error: "T\xE0i kho\u1EA3n Google AI Studio c\u1EE7a b\u1EA1n \u0111\xE3 h\u1EBFt s\u1ED1 d\u01B0 t\xEDn d\u1EE5ng tr\u1EA3 tr\u01B0\u1EDBc (Prepayment credits are depleted). Vui l\xF2ng n\u1EA1p th\xEAm ti\u1EC1n t\xEDn d\u1EE5ng ho\u1EB7c ch\u1ECDn d\u1EF1 \xE1n Google Cloud c\xF3 ph\u01B0\u01A1ng th\u1EE9c thanh to\xE1n \u0111ang ho\u1EA1t \u0111\u1ED9ng t\u1EA1i https://ai.studio/projects \u0111\u1EC3 ti\u1EBFp t\u1EE5c s\u1EED d\u1EE5ng.",
                code: 402,
                isPrepaymentDepleted: true,
                billingUrl: "https://ai.studio/projects",
                docsUrl: "https://ai.google.dev/gemini-api/docs/billing#prepay",
                rawError
              });
            }
            if (rawError.includes("spending cap") || rawError.includes("spend cap")) {
              return res.status(429).json({
                error: "D\u1EF1 \xE1n Google Cloud c\u1EE7a b\u1EA1n \u0111\xE3 ch\u1EA1m gi\u1EDBi h\u1EA1n chi ti\xEAu h\xE0ng th\xE1ng (Monthly Spending Cap). Vui l\xF2ng truy c\u1EADp https://ai.studio/spend \u0111\u1EC3 n\xE2ng m\u1EE9c gi\u1EDBi h\u1EA1n chi ti\xEAu cho d\u1EF1 \xE1n, ho\u1EB7c ch\u1ECDn d\u1EF1 \xE1n kh\xE1c c\xF3 h\u1EA1n m\u1EE9c kh\u1EA3 d\u1EE5ng.",
                code: 429,
                isSpendingCap: true,
                spendUrl: "https://ai.studio/spend",
                rawError
              });
            }
            if (rawError.includes("429") || rawError.includes("RESOURCE_EXHAUSTED") || rawError.includes("quota") || rawError.includes("Quota exceeded")) {
              return res.status(429).json({
                error: "M\xF4 h\xECnh t\u1EA1o v\xE0 ch\u1EC9nh s\u1EEDa \u1EA3nh AI y\xEAu c\u1EA7u API Key c\xF3 li\xEAn k\u1EBFt thanh to\xE1n (Paid Tier) v\xE0 c\xF2n h\u1EA1n m\u1EE9c kh\u1EA3 d\u1EE5ng (Quota). Vui l\xF2ng ki\u1EC3m tra l\u1EA1i thi\u1EBFt l\u1EADp h\u1EA1n m\u1EE9c t\u1EA1i Google AI Studio.",
                code: 429,
                quotaExceeded: true,
                rawError
              });
            }
            throw new Error(`L\u1ED7i t\u1EEB Gemini AI: ${rawError}`);
          }
        }
      }
      if (!generatedImageUrl) {
        return res.status(502).json({
          error: "Kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c h\xECnh \u1EA3nh ch\u1EC9nh s\u1EEDa t\u1EEB m\xF4 h\xECnh AI. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i ghi ch\xFA v\xE0 th\u1EED l\u1EA1i."
        });
      }
      let savedEndpointUrl = generatedImageUrl;
      if (folderId && fileId) {
        savedEndpointUrl = saveRetouchedImage(folderId, fileId, generatedImageUrl);
        if (!localAlbumsStore[folderId]) {
          localAlbumsStore[folderId] = loadAlbumFromDisk(folderId);
        }
        if (!localAlbumsStore[folderId].retouched) {
          localAlbumsStore[folderId].retouched = {};
        }
        localAlbumsStore[folderId].retouched[fileId] = savedEndpointUrl;
        saveAlbumToDisk(folderId, localAlbumsStore[folderId]);
        const currentDb = getSafeDb();
        if (currentDb) {
          try {
            await currentDb.collection("albums").doc(folderId).set({
              retouched: localAlbumsStore[folderId].retouched,
              updatedAt: import_firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          } catch (e) {
            console.warn("Could not persist retouched image to Firestore, stored on disk:", e);
          }
        }
      }
      res.json({
        success: true,
        retouchedImageUrl: generatedImageUrl,
        savedEndpointUrl,
        modelUsed,
        resolutionUsed: validResolution,
        notesCount: annotations.length
      });
    } catch (error) {
      console.error("[AI Retouch Error]:", error);
      const rawError = error?.message || String(error);
      if (rawError.includes("prepayment credits") || rawError.includes("depleted") || rawError.includes("402")) {
        return res.status(402).json({
          error: "T\xE0i kho\u1EA3n Google AI Studio c\u1EE7a b\u1EA1n \u0111\xE3 h\u1EBFt s\u1ED1 d\u01B0 t\xEDn d\u1EE5ng tr\u1EA3 tr\u01B0\u1EDBc (Prepayment credits are depleted). Vui l\xF2ng n\u1EA1p th\xEAm ti\u1EC1n t\xEDn d\u1EE5ng ho\u1EB7c ch\u1ECDn d\u1EF1 \xE1n Google Cloud c\xF3 ph\u01B0\u01A1ng th\u1EE9c thanh to\xE1n \u0111ang ho\u1EA1t \u0111\u1ED9ng t\u1EA1i https://ai.studio/projects \u0111\u1EC3 ti\u1EBFp t\u1EE5c s\u1EED d\u1EE5ng.",
          code: 402,
          isPrepaymentDepleted: true,
          billingUrl: "https://ai.studio/projects",
          docsUrl: "https://ai.google.dev/gemini-api/docs/billing#prepay",
          rawError
        });
      }
      if (rawError.includes("429") || rawError.includes("RESOURCE_EXHAUSTED") || rawError.includes("quota") || rawError.includes("Quota exceeded")) {
        return res.status(429).json({
          error: "M\xF4 h\xECnh t\u1EA1o v\xE0 ch\u1EC9nh s\u1EEDa \u1EA3nh AI (gemini-3.1-flash-lite-image) y\xEAu c\u1EA7u API Key c\xF3 li\xEAn k\u1EBFt thanh to\xE1n (Paid Tier) theo ch\xEDnh s\xE1ch c\u1EE7a Google Gemini. H\u1EA1n m\u1EE9c mi\u1EC5n ph\xED hi\u1EC7n t\u1EA1i cho m\xF4 h\xECnh t\u1EA1o \u1EA3nh l\xE0 0 l\u01B0\u1EE3t. Vui l\xF2ng k\xEDch ho\u1EA1t Paid API Key trong c\xE0i \u0111\u1EB7t \u0111\u1EC3 s\u1EED d\u1EE5ng t\xEDnh n\u0103ng n\xE0y.",
          code: 429,
          quotaExceeded: true
        });
      }
      res.status(500).json({
        error: error.message || "\u0110\xE3 x\u1EA3y ra s\u1EF1 c\u1ED1 khi g\u1ECDi Gemini AI x\u1EED l\xFD \u1EA3nh."
      });
    }
  });
  async function fetchPublicDriveFolderFallback(folderId) {
    const embedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
    const response = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) {
      throw new Error("Kh\xF4ng th\u1EC3 truy c\u1EADp th\u01B0 m\u1EE5c Google Drive. H\xE3y \u0111\u1EA3m b\u1EA3o th\u01B0 m\u1EE5c \u0111\xE3 \u0111\u01B0\u1EE3c b\u1EADt chia s\u1EBB c\xF4ng khai (B\u1EA5t k\u1EF3 ai c\xF3 \u0111\u01B0\u1EDDng li\xEAn k\u1EBFt).");
    }
    const html = await response.text();
    const files = [];
    const entryRegex = /<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
    let match;
    while ((match = entryRegex.exec(html)) !== null) {
      const entryBlock = match[0];
      const id = match[1];
      const name = match[2].trim();
      const isImageMime = entryBlock.includes("type/image/") || /\.(jpe?g|png|webp|gif|bmp|heic|tiff?|avif)$/i.test(name);
      if (!isImageMime) continue;
      const thumbMatch = entryBlock.match(/<div class="flip-entry-thumb"><img src="([^"]+)"/);
      const thumbnailLink = thumbMatch?.[1] ? thumbMatch[1].replace(/=s\d+$/, "=s220") : `https://lh3.googleusercontent.com/d/${id}=s220`;
      files.push({
        id,
        name,
        thumbnailLink,
        webContentLink: `https://drive.google.com/uc?id=${id}&export=download`,
        createdTime: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return files;
  }
  app.get("/api/drive/files", async (req, res) => {
    try {
      const folderId = req.query.folderId;
      const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
      if (!folderId) {
        return res.status(400).json({ error: "folderId is required" });
      }
      if (apiKey) {
        try {
          let allFiles = [];
          let pageToken = "";
          let pages = 0;
          let apiSucceeded = true;
          do {
            const url = new URL("https://www.googleapis.com/drive/v3/files");
            url.searchParams.append(
              "q",
              `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`
            );
            url.searchParams.append(
              "fields",
              "nextPageToken, files(id, name, thumbnailLink, webContentLink, createdTime)"
            );
            url.searchParams.append("pageSize", "1000");
            url.searchParams.append("key", apiKey);
            if (pageToken) {
              url.searchParams.append("pageToken", pageToken);
            }
            const response = await fetch(url.toString());
            if (!response.ok) {
              const errorData = await response.text();
              console.warn("Drive API key request failed, falling back to public folder parser:", errorData);
              apiSucceeded = false;
              break;
            }
            const data = await response.json();
            if (data.files) {
              allFiles = allFiles.concat(data.files);
            }
            pageToken = data.nextPageToken;
            pages++;
          } while (pageToken && pages < 5);
          if (apiSucceeded) {
            return res.json({ files: allFiles });
          }
        } catch (apiErr) {
          console.warn("Drive API error, trying public fallback:", apiErr);
        }
      }
      const fallbackFiles = await fetchPublicDriveFolderFallback(folderId);
      res.json({ files: fallbackFiles });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });
  app.get("/api/proxy-image", async (req, res) => {
    try {
      const url = req.query.url;
      if (!url) {
        return res.status(400).send("url parameter is required");
      }
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).send("Failed to fetch upstream image");
      }
      const contentType = response.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error("Proxy image error:", err);
      res.status(500).send("Error proxying image");
    }
  });
  function getOrCreateUserRecord(input) {
    const cleanEmail = (input.email || "").trim().toLowerCase();
    const isOwnerAdmin = cleanEmail === "huyitcom@gmail.com";
    let targetUid = input.uid;
    let existing = creditsStore.users[targetUid];
    if (!existing && cleanEmail) {
      const foundEntry = Object.values(creditsStore.users).find(
        (u) => u.email?.toLowerCase() === cleanEmail
      );
      if (foundEntry) {
        if (targetUid.startsWith("usr_") && !foundEntry.uid.startsWith("usr_")) {
          targetUid = foundEntry.uid;
          existing = foundEntry;
        } else {
          const oldUid = foundEntry.uid;
          existing = { ...foundEntry, uid: targetUid };
          if (oldUid !== targetUid && oldUid.startsWith("usr_")) {
            delete creditsStore.users[oldUid];
          }
        }
      }
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (existing) {
      const updatedRole = isOwnerAdmin || existing.role === "admin" ? "admin" : input.role === "vip" || existing.role === "vip" ? "vip" : existing.role || "user";
      const record = {
        ...existing,
        uid: targetUid,
        email: cleanEmail || existing.email,
        displayName: input.displayName || existing.displayName || cleanEmail.split("@")[0] || "Kh\xE1ch h\xE0ng",
        photoURL: input.photoURL !== void 0 ? input.photoURL : existing.photoURL,
        role: updatedRole,
        credits: typeof existing.credits === "number" ? existing.credits : 3,
        renderCount: typeof existing.renderCount === "number" ? existing.renderCount : 0,
        lastLoginAt: nowIso
      };
      creditsStore.users[targetUid] = record;
      saveCreditsStore(creditsStore);
      return record;
    }
    const initialRole = isOwnerAdmin ? "admin" : input.role === "vip" ? "vip" : "user";
    const initialCredits = isOwnerAdmin ? 25 : 3;
    const newRecord = {
      uid: input.uid,
      email: cleanEmail || `${input.uid}@photobook.vn`,
      displayName: input.displayName || (isOwnerAdmin ? "L\xEA Kh\u1EAFc Huy" : cleanEmail.split("@")[0] || "Kh\xE1ch h\xE0ng m\u1EDBi"),
      photoURL: input.photoURL || null,
      role: initialRole,
      credits: initialCredits,
      renderCount: 0,
      createdAt: nowIso,
      lastLoginAt: nowIso
    };
    creditsStore.users[input.uid] = newRecord;
    saveCreditsStore(creditsStore);
    return newRecord;
  }
  app.post("/api/credits/sync", async (req, res) => {
    try {
      const { uid, email, displayName, photoURL, role } = req.body || {};
      if (!uid) {
        return res.status(400).json({ error: "uid is required" });
      }
      const record = getOrCreateUserRecord({ uid, email, displayName, photoURL, role });
      const currentDb = getSafeDb();
      if (currentDb) {
        try {
          const snap = await currentDb.collection("users").doc(uid).get();
          if (snap.exists) {
            const fbData = snap.data() || {};
            if (typeof fbData.credits === "number" && fbData.credits > record.credits) {
              record.credits = fbData.credits;
            }
            if (typeof fbData.renderCount === "number" && fbData.renderCount > record.renderCount) {
              record.renderCount = fbData.renderCount;
            }
            if (fbData.role === "admin" || fbData.role === "vip") {
              record.role = fbData.role;
            }
            creditsStore.users[uid] = record;
            saveCreditsStore(creditsStore);
          }
          await currentDb.collection("users").doc(uid).set(
            {
              ...record,
              updatedAt: import_firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        } catch (e) {
          console.warn("[Credits Sync] Firestore sync warning:", e);
        }
      }
      res.json({ success: true, user: record });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to sync user credits" });
    }
  });
  app.get("/api/credits/:uid", async (req, res) => {
    try {
      const uid = req.params.uid;
      let record = creditsStore.users[uid];
      const currentDb = getSafeDb();
      if (currentDb) {
        try {
          const snap = await currentDb.collection("users").doc(uid).get();
          if (snap.exists) {
            const data = snap.data() || {};
            record = getOrCreateUserRecord({
              uid,
              email: data.email || record?.email,
              displayName: data.displayName || record?.displayName,
              photoURL: data.photoURL || record?.photoURL,
              role: data.role || record?.role
            });
            if (typeof data.credits === "number" && data.credits > record.credits) {
              record.credits = data.credits;
              creditsStore.users[uid] = record;
              saveCreditsStore(creditsStore);
            }
          }
        } catch {
        }
      }
      if (!record) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true, user: record });
    } catch (err) {
      res.status(500).json({ error: err.message || "Error fetching user credits" });
    }
  });
  app.post("/api/credits/consume", async (req, res) => {
    try {
      const { uid, email, displayName, resolution, fileId, fileName, folderId, notesCount } = req.body || {};
      if (!uid) {
        return res.status(400).json({ error: "uid is required" });
      }
      const validRes = resolution === "4K" ? "4K" : resolution === "1K" ? "1K" : "2K";
      const cost = validRes === "4K" ? 3 : validRes === "2K" ? 2 : 1;
      const user = getOrCreateUserRecord({ uid, email, displayName });
      if (user.credits < cost) {
        return res.status(402).json({
          error: `S\u1ED1 d\u01B0 l\u01B0\u1EE3t Render AI kh\xF4ng \u0111\u1EE7 (C\u1EA7n ${cost} l\u01B0\u1EE3t cho \u1EA3nh ${validRes}, hi\u1EC7n c\xF2n ${user.credits} l\u01B0\u1EE3t). Vui l\xF2ng n\u1EA1p th\xEAm l\u01B0\u1EE3t!`,
          insufficientCredits: true,
          requiredCredits: cost,
          currentCredits: user.credits
        });
      }
      user.credits = Math.max(0, user.credits - cost);
      user.renderCount = (user.renderCount || 0) + 1;
      creditsStore.users[uid] = user;
      const logItem = {
        id: "rnd_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        resolution: validRes,
        creditsCost: cost,
        remainingCredits: user.credits,
        fileId,
        fileName,
        folderId,
        notesCount,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      creditsStore.renderLogs.unshift(logItem);
      if (creditsStore.renderLogs.length > 300) {
        creditsStore.renderLogs = creditsStore.renderLogs.slice(0, 300);
      }
      saveCreditsStore(creditsStore);
      const currentDb = getSafeDb();
      if (currentDb) {
        try {
          await currentDb.collection("users").doc(uid).set(
            {
              credits: user.credits,
              renderCount: user.renderCount,
              updatedAt: import_firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          );
          await currentDb.collection("render_logs").doc(logItem.id).set(logItem);
        } catch (e) {
          console.warn("[Credits Consume] Firestore sync warning:", e);
        }
      }
      res.json({
        success: true,
        cost,
        credits: user.credits,
        renderCount: user.renderCount,
        user,
        log: logItem
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to consume credits" });
    }
  });
  async function fulfillPaidOrder(orderCodeNum, approvedBy = "PayOS Auto Webhook") {
    const key = String(orderCodeNum);
    const order = creditsStore.orders[key];
    if (!order) return null;
    const user = getOrCreateUserRecord({
      uid: order.uid,
      email: order.email,
      displayName: order.displayName
    });
    if (order.status === "PAID") {
      return { order, user };
    }
    order.status = "PAID";
    order.paidAt = (/* @__PURE__ */ new Date()).toISOString();
    order.approvedBy = approvedBy;
    creditsStore.orders[key] = order;
    user.credits = (user.credits || 0) + Number(order.credits || 0);
    if (user.role === "user") {
      user.role = "vip";
    }
    creditsStore.users[user.uid] = user;
    saveCreditsStore(creditsStore);
    const currentDb = getSafeDb();
    if (currentDb) {
      try {
        await currentDb.collection("topup_orders").doc(key).set(order, { merge: true });
        await currentDb.collection("users").doc(user.uid).set(
          {
            credits: user.credits,
            role: user.role,
            updatedAt: import_firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      } catch (e) {
        console.warn("[FulfillOrder] Firestore sync warning:", e);
      }
    }
    return { order, user };
  }
  app.post("/api/payos/create-payment-link", async (req, res) => {
    try {
      const { uid, email, displayName, packageId, packageName, credits, amount } = req.body || {};
      if (!uid || !credits || !amount) {
        return res.status(400).json({ error: "Missing required top-up package details" });
      }
      const user = getOrCreateUserRecord({ uid, email, displayName });
      const timestampPart = String(Date.now()).slice(-7);
      const randomPart = String(Math.floor(10 + Math.random() * 89));
      const orderCode = Number(`${timestampPart}${randomPart}`);
      const alphaCode = "CS" + Date.now().toString(36).toUpperCase().slice(-3) + String(orderCode).slice(-6);
      const transferContent = `${alphaCode} PBVN ${credits}luot`;
      const bankId = "MB";
      const bankName = "MB Bank (Qu\xE2n \u0110\u1ED9i)";
      const accountNumber = "0007979999999";
      const accountName = "LE KHAC HUY";
      let qrImageUrl = `https://img.vietqr.io/image/${bankId}-${accountNumber}-compact2.png?amount=${Number(
        amount
      )}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountName)}`;
      const appBaseUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      let checkoutUrl = `https://img.vietqr.io/image/${bankId}-${accountNumber}-print.png?amount=${Number(
        amount
      )}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountName)}`;
      const payosClientId = process.env.PAYOS_CLIENT_ID;
      const payosApiKey = process.env.PAYOS_API_KEY;
      const payosChecksumKey = process.env.PAYOS_CHECKSUM_KEY;
      if (payosClientId && payosApiKey && payosChecksumKey) {
        try {
          const cancelUrl = `${appBaseUrl}/?topup=cancelled`;
          const returnUrl = `${appBaseUrl}/?topup=success&orderCode=${orderCode}`;
          const description = transferContent.slice(0, 25);
          const signData = `amount=${Number(amount)}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
          const signature = import_crypto.default.createHmac("sha256", payosChecksumKey).update(signData).digest("hex");
          const payosRes = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
            method: "POST",
            headers: {
              "x-client-id": payosClientId,
              "x-api-key": payosApiKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              orderCode,
              amount: Number(amount),
              description,
              cancelUrl,
              returnUrl,
              signature
            })
          });
          const payosJson = await payosRes.json();
          if (payosRes.ok && payosJson?.data) {
            if (payosJson.data.checkoutUrl) {
              checkoutUrl = payosJson.data.checkoutUrl;
            }
          }
        } catch (payosErr) {
          console.warn("[PayOS] Using direct VietQR MB Bank fallback:", payosErr);
        }
      }
      const newOrder = {
        orderCode,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        packageId: packageId || `pkg_${credits}`,
        packageName: packageName || `G\xF3i +${credits} l\u01B0\u1EE3t`,
        credits: Number(credits),
        amount: Number(amount),
        transferContent,
        bankName,
        accountNumber,
        accountName,
        qrImageUrl,
        checkoutUrl,
        status: "PENDING",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      creditsStore.orders[String(orderCode)] = newOrder;
      saveCreditsStore(creditsStore);
      const currentDb = getSafeDb();
      if (currentDb) {
        try {
          await currentDb.collection("topup_orders").doc(String(orderCode)).set(newOrder);
        } catch (e) {
          console.warn("[PayOS Create] Firestore order save warning:", e);
        }
      }
      res.json({
        success: true,
        order: newOrder
      });
    } catch (err) {
      console.error("[PayOS Create Error]:", err);
      res.status(500).json({ error: err.message || "Kh\xF4ng th\u1EC3 kh\u1EDFi t\u1EA1o m\xE3 VietQR PayOS" });
    }
  });
  app.get("/api/payos/order/:orderCode", async (req, res) => {
    try {
      const orderCode = Number(req.params.orderCode);
      const key = String(orderCode);
      const order = creditsStore.orders[key];
      if (!order) {
        return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n n\u1EA1p l\u01B0\u1EE3t" });
      }
      if (order.status !== "PAID") {
        const payosClientId = process.env.PAYOS_CLIENT_ID;
        const payosApiKey = process.env.PAYOS_API_KEY;
        if (payosClientId && payosApiKey) {
          try {
            const checkRes = await fetch(`https://api-merchant.payos.vn/v2/payment-requests/${orderCode}`, {
              headers: {
                "x-client-id": payosClientId,
                "x-api-key": payosApiKey
              }
            });
            if (checkRes.ok) {
              const checkJson = await checkRes.json();
              if (checkJson?.data?.status === "PAID") {
                const fulfilled = await fulfillPaidOrder(orderCode, "PayOS Auto API");
                if (fulfilled) {
                  return res.json({ success: true, order: fulfilled.order, user: fulfilled.user });
                }
              }
            }
          } catch {
          }
        }
      }
      const user = creditsStore.users[order.uid];
      res.json({
        success: true,
        order,
        user
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "L\u1ED7i ki\u1EC3m tra tr\u1EA1ng th\xE1i giao d\u1ECBch" });
    }
  });
  app.post("/api/payos/order/:orderCode/confirm-transfer", async (req, res) => {
    try {
      const orderCode = Number(req.params.orderCode);
      const key = String(orderCode);
      const order = creditsStore.orders[key];
      if (!order) {
        return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n giao d\u1ECBch" });
      }
      if (order.status === "PAID") {
        return res.json({
          success: true,
          order,
          user: creditsStore.users[order.uid]
        });
      }
      order.status = "WAITING_APPROVAL";
      order.userReportedAt = (/* @__PURE__ */ new Date()).toISOString();
      creditsStore.orders[key] = order;
      saveCreditsStore(creditsStore);
      const currentDb = getSafeDb();
      if (currentDb) {
        try {
          await currentDb.collection("topup_orders").doc(key).set(order, { merge: true });
        } catch {
        }
      }
      res.json({
        success: true,
        order,
        user: creditsStore.users[order.uid]
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "L\u1ED7i x\xE1c nh\u1EADn chuy\u1EC3n kho\u1EA3n" });
    }
  });
  app.post("/api/payos/webhook", async (req, res) => {
    try {
      const body = req.body || {};
      const data = body.data || body;
      const orderCode = Number(data?.orderCode);
      if (orderCode && (body.code === "00" || data?.code === "00" || body.success === true)) {
        await fulfillPaidOrder(orderCode, "PayOS Webhook 24/7");
      }
      res.json({ error: 0, message: "Ok", data: null });
    } catch (err) {
      console.error("[PayOS Webhook Error]:", err);
      res.status(200).json({ error: 0, message: "Handled" });
    }
  });
  function mergeFirestoreUsersList(rawUsers) {
    let changed = false;
    for (const d of rawUsers) {
      if (!d) continue;
      const uid = String(d.uid || d.id || "").trim();
      if (!uid) continue;
      const cleanEmail = String(d.email || "").trim().toLowerCase();
      const isOwnerAdmin = cleanEmail === "huyitcom@gmail.com" || cleanEmail.includes("huyitcom");
      const defaultRole = isOwnerAdmin ? "admin" : d.role === "admin" || d.role === "vip" ? d.role : "user";
      const defaultCredits = isOwnerAdmin ? 25 : 3;
      let syntheticMatch;
      if (cleanEmail && !uid.startsWith("usr_")) {
        syntheticMatch = Object.values(creditsStore.users).find(
          (u) => u.uid !== uid && u.uid.startsWith("usr_") && u.email?.toLowerCase() === cleanEmail
        );
      }
      const existing = creditsStore.users[uid] || syntheticMatch;
      if (syntheticMatch && syntheticMatch.uid !== uid) {
        delete creditsStore.users[syntheticMatch.uid];
        changed = true;
      }
      if (!existing) {
        creditsStore.users[uid] = {
          uid,
          email: d.email || `${uid}@photobook.vn`,
          displayName: d.displayName || (d.email ? d.email.split("@")[0] : "Kh\xE1ch h\xE0ng"),
          photoURL: d.photoURL || null,
          role: defaultRole,
          credits: typeof d.credits === "number" ? d.credits : defaultCredits,
          renderCount: typeof d.renderCount === "number" ? d.renderCount : 0,
          createdAt: d.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
          lastLoginAt: d.lastLoginAt || d.createdAt || (/* @__PURE__ */ new Date()).toISOString()
        };
        changed = true;
      } else {
        const mergedRole = isOwnerAdmin || existing.role === "admin" || d.role === "admin" ? "admin" : existing.role === "vip" || d.role === "vip" ? "vip" : "user";
        creditsStore.users[uid] = {
          ...existing,
          uid,
          email: d.email || existing.email || `${uid}@photobook.vn`,
          displayName: d.displayName || existing.displayName || "Kh\xE1ch h\xE0ng",
          photoURL: d.photoURL || existing.photoURL || null,
          role: mergedRole,
          credits: typeof existing.credits === "number" ? existing.credits : typeof d.credits === "number" ? d.credits : defaultCredits,
          renderCount: typeof existing.renderCount === "number" ? Math.max(existing.renderCount, typeof d.renderCount === "number" ? d.renderCount : 0) : typeof d.renderCount === "number" ? d.renderCount : 0,
          createdAt: d.createdAt || existing.createdAt || (/* @__PURE__ */ new Date()).toISOString()
        };
        changed = true;
      }
    }
    if (changed) {
      saveCreditsStore(creditsStore);
    }
  }
  async function fetchFirestoreUsersViaRest() {
    try {
      const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "photo-picker-507413";
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?pageSize=300`;
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      const docs = Array.isArray(data?.documents) ? data.documents : [];
      return docs.map((docItem) => {
        const nameParts = String(docItem.name || "").split("/");
        const docId = nameParts[nameParts.length - 1] || "";
        const fields = docItem.fields || {};
        const getStr = (f) => f?.stringValue ?? null;
        const getNum = (f) => f?.integerValue !== void 0 ? Number(f.integerValue) : f?.doubleValue !== void 0 ? Number(f.doubleValue) : void 0;
        const getTime = (f) => f?.timestampValue || f?.stringValue || void 0;
        return {
          uid: getStr(fields.uid) || docId,
          email: getStr(fields.email),
          displayName: getStr(fields.displayName),
          photoURL: getStr(fields.photoURL),
          role: getStr(fields.role),
          credits: getNum(fields.credits),
          renderCount: getNum(fields.renderCount),
          createdAt: getTime(fields.createdAt) || docItem.createTime,
          lastLoginAt: getTime(fields.lastLoginAt) || docItem.updateTime
        };
      });
    } catch (e) {
      return [];
    }
  }
  function buildAdminOverviewResponse() {
    const allUsers = Object.values(creditsStore.users).sort((a, b) => {
      if (a.role === "admin" && b.role !== "admin") return -1;
      if (b.role === "admin" && a.role !== "admin") return 1;
      return (b.credits || 0) - (a.credits || 0);
    });
    const allOrders = Object.values(creditsStore.orders).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return {
      success: true,
      users: allUsers,
      orders: allOrders,
      renderLogs: creditsStore.renderLogs || []
    };
  }
  app.get("/api/admin/overview", async (_req, res) => {
    try {
      const currentDb = getSafeDb();
      if (currentDb) {
        try {
          const usersSnap = await currentDb.collection("users").get();
          const fbUsers = [];
          usersSnap.forEach((docSnap) => {
            const d = docSnap.data();
            if (d) {
              fbUsers.push({ ...d, uid: d.uid || docSnap.id });
            }
          });
          mergeFirestoreUsersList(fbUsers);
        } catch (e) {
          console.warn("[Admin Overview] Firestore Admin SDK merge warning:", e);
        }
      } else {
        const restUsers = await fetchFirestoreUsersViaRest();
        if (restUsers.length > 0) {
          mergeFirestoreUsersList(restUsers);
        }
      }
      res.json(buildAdminOverviewResponse());
    } catch (err) {
      res.status(500).json({ error: err.message || "L\u1ED7i t\u1EA3i d\u1EEF li\u1EC7u qu\u1EA3n tr\u1ECB" });
    }
  });
  app.post("/api/admin/sync-firestore", async (req, res) => {
    try {
      const { users: clientFirestoreUsers } = req.body || {};
      if (Array.isArray(clientFirestoreUsers) && clientFirestoreUsers.length > 0) {
        mergeFirestoreUsersList(clientFirestoreUsers);
      } else {
        const restUsers = await fetchFirestoreUsersViaRest();
        if (restUsers.length > 0) {
          mergeFirestoreUsersList(restUsers);
        }
      }
      res.json(buildAdminOverviewResponse());
    } catch (err) {
      res.status(500).json({ error: err.message || "L\u1ED7i \u0111\u1ED3ng b\u1ED9 danh s\xE1ch th\xE0nh vi\xEAn t\u1EEB Firebase" });
    }
  });
  app.post("/api/admin/credits/adjust", async (req, res) => {
    try {
      const { uid, delta, exactCredits, role, adminEmail } = req.body || {};
      if (!uid) {
        return res.status(400).json({ error: "uid is required" });
      }
      const user = getOrCreateUserRecord({ uid });
      if (typeof exactCredits === "number" && !Number.isNaN(exactCredits)) {
        user.credits = Math.max(0, Math.round(exactCredits));
      } else if (typeof delta === "number" && !Number.isNaN(delta)) {
        user.credits = Math.max(0, (user.credits || 0) + Math.round(delta));
      }
      if (role && (role === "admin" || role === "vip" || role === "user")) {
        user.role = role;
      }
      creditsStore.users[uid] = user;
      saveCreditsStore(creditsStore);
      const currentDb = getSafeDb();
      if (currentDb) {
        try {
          await currentDb.collection("users").doc(uid).set(
            {
              credits: user.credits,
              role: user.role,
              updatedByAdmin: adminEmail || "Admin",
              updatedAt: import_firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        } catch (e) {
          console.warn("[Admin Adjust] Firestore sync warning:", e);
        }
      }
      res.json({
        success: true,
        user
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Kh\xF4ng th\u1EC3 c\u1EADp nh\u1EADt s\u1ED1 l\u01B0\u1EE3t" });
    }
  });
  app.post("/api/admin/orders/:orderCode/approve", async (req, res) => {
    try {
      const orderCode = Number(req.params.orderCode);
      const { adminEmail } = req.body || {};
      const fulfilled = await fulfillPaidOrder(orderCode, adminEmail || "Admin Duy\u1EC7t VietQR");
      if (!fulfilled) {
        return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n n\u1EA1p VietQR" });
      }
      res.json({
        success: true,
        order: fulfilled.order,
        user: fulfilled.user
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "L\u1ED7i duy\u1EC7t \u0111\u01A1n n\u1EA1p VietQR" });
    }
  });
  app.post("/api/admin/orders/:orderCode/reject", async (req, res) => {
    try {
      const orderCode = Number(req.params.orderCode);
      const key = String(orderCode);
      const order = creditsStore.orders[key];
      if (!order) {
        return res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n n\u1EA1p VietQR" });
      }
      order.status = "CANCELLED";
      creditsStore.orders[key] = order;
      saveCreditsStore(creditsStore);
      const currentDb = getSafeDb();
      if (currentDb) {
        try {
          await currentDb.collection("topup_orders").doc(key).set(order, { merge: true });
        } catch {
        }
      }
      res.json({
        success: true,
        order
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "L\u1ED7i t\u1EEB ch\u1ED1i \u0111\u01A1n n\u1EA1p" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  async function syncAuthorizedDomains() {
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    const appUrl = process.env.APP_URL;
    if (!serviceAccountStr) return;
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const sa = JSON.parse(serviceAccountStr);
      const auth = new GoogleAuth({
        credentials: sa,
        scopes: [
          "https://www.googleapis.com/auth/cloud-platform",
          "https://www.googleapis.com/auth/identitytoolkit"
        ]
      });
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (!token?.token) return;
      const projectId = sa.project_id || "photo-picker-507413";
      const getRes = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`, {
        headers: { Authorization: `Bearer ${token.token}` }
      });
      if (!getRes.ok) return;
      const currentConfig = await getRes.json();
      const domains = new Set(currentConfig.authorizedDomains || []);
      const candidateHosts = [];
      if (appUrl) {
        try {
          const u = new URL(appUrl);
          candidateHosts.push(u.hostname);
          if (u.hostname.includes(".run.app")) {
            candidateHosts.push(u.hostname.replace(/^ais-dev-/, "ais-pre-"));
            candidateHosts.push(u.hostname.replace(/^ais-dev-/, "ais-shared-"));
            candidateHosts.push(u.hostname.replace(/^ais-dev-/, "ais-mob-"));
          }
        } catch (e) {
        }
      }
      let needsUpdate = false;
      for (const h of candidateHosts) {
        if (h && !domains.has(h)) {
          domains.add(h);
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        console.log("[Server] Registering new authorized domains in Firebase Auth:", candidateHosts);
        await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=authorizedDomains`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token.token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            authorizedDomains: Array.from(domains)
          })
        });
        console.log("[Server] Firebase Auth authorizedDomains updated successfully.");
      }
    } catch (err) {
      console.warn("[Server] Could not sync authorized domains with Firebase:", err?.message);
    }
  }
  syncAuthorizedDomains();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
