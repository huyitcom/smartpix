import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Normalize request URL on Vercel Serverless so both /api/... and /... match Express routes
app.use((req, _res, next) => {
  if (!req.url.startsWith("/api/") && req.url !== "/api") {
    req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
  }
  next();
});

let db: any = null;

const BASE_DATA_DIR = process.env.VERCEL ? path.join("/tmp", "data") : path.join(process.cwd(), "data");
const RETOUCHED_DIR = path.join(BASE_DATA_DIR, "retouched");
const ALBUMS_DIR = path.join(BASE_DATA_DIR, "albums");
const CREDITS_STORE_FILE = path.join(BASE_DATA_DIR, "credits_store.json");

try {
  fs.mkdirSync(RETOUCHED_DIR, { recursive: true });
  fs.mkdirSync(ALBUMS_DIR, { recursive: true });
} catch {}

export interface StoredUserRecord {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  role: "admin" | "vip" | "user";
  credits: number;
  renderCount: number;
  createdAt: string;
  lastLoginAt: string;
}

export interface StoredTopupOrder {
  orderCode: number;
  uid: string;
  email: string;
  displayName: string;
  packageId: string;
  packageName: string;
  credits: number;
  amount: number;
  transferContent: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  qrImageUrl: string;
  checkoutUrl: string;
  status: "PENDING" | "WAITING_APPROVAL" | "PAID" | "CANCELLED";
  createdAt: string;
  paidAt?: string;
  userReportedAt?: string;
  approvedBy?: string;
}

export interface StoredRenderLog {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  resolution: "1K" | "2K" | "4K";
  creditsCost: number;
  remainingCredits: number;
  fileId?: string;
  fileName?: string;
  folderId?: string;
  notesCount?: number;
  createdAt: string;
}

interface CreditsStoreData {
  users: Record<string, StoredUserRecord>;
  orders: Record<string, StoredTopupOrder>;
  renderLogs: StoredRenderLog[];
}

function loadCreditsStore(): CreditsStoreData {
  const defaultUsers: Record<string, StoredUserRecord> = {
    usr_admin_huyitcom: {
      uid: "usr_admin_huyitcom",
      email: "huyitcom@gmail.com",
      displayName: "Lê Khắc Huy",
      photoURL: null,
      role: "admin",
      credits: 25,
      renderCount: 0,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    },
  };

  try {
    if (fs.existsSync(CREDITS_STORE_FILE)) {
      const raw = fs.readFileSync(CREDITS_STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        users: { ...defaultUsers, ...(parsed.users || {}) },
        orders: parsed.orders || {},
        renderLogs: Array.isArray(parsed.renderLogs) ? parsed.renderLogs : [],
      };
    }
  } catch {}

  return {
    users: defaultUsers,
    orders: {},
    renderLogs: [],
  };
}

function saveCreditsStore(store: CreditsStoreData): void {
  try {
    fs.mkdirSync(path.dirname(CREDITS_STORE_FILE), { recursive: true });
    fs.writeFileSync(CREDITS_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {}
}

const creditsStore: CreditsStoreData = loadCreditsStore();
saveCreditsStore(creditsStore);

function loadAlbumFromDisk(folderId: string): {
  selectedIds?: string[];
  annotations?: Record<string, any>;
  retouched?: Record<string, string>;
} {
  try {
    const filePath = path.join(ALBUMS_DIR, `${folderId}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}
  return { selectedIds: [], annotations: {}, retouched: {} };
}

function saveAlbumToDisk(
  folderId: string,
  data: { selectedIds?: string[]; annotations?: Record<string, any>; retouched?: Record<string, string> }
): void {
  try {
    fs.mkdirSync(ALBUMS_DIR, { recursive: true });
    const filePath = path.join(ALBUMS_DIR, `${folderId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

const retouchedMemoryBuffers = new Map<string, { buffer: Buffer; mimeType: string }>();

function saveRetouchedImage(folderId: string, fileId: string, dataUrlOrUrl: string): string {
  if (!dataUrlOrUrl) return "";
  if (!dataUrlOrUrl.startsWith("data:image/")) {
    return dataUrlOrUrl;
  }

  // On Vercel serverless, return the data URL if it's small enough or store in /tmp
  try {
    const match = dataUrlOrUrl.match(/^data:([a-zA-Z0-9\/+.-]+);base64,(.+)$/);
    if (!match) return dataUrlOrUrl;

    const mimeType = match[1] || "image/jpeg";
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");

    const folderDir = path.join(RETOUCHED_DIR, folderId);
    fs.mkdirSync(folderDir, { recursive: true });
    const filePath = path.join(folderDir, `${fileId}.jpg`);
    fs.writeFileSync(filePath, buffer);

    const cacheKey = `${folderId}_${fileId}`;
    retouchedMemoryBuffers.set(cacheKey, { buffer, mimeType });

    return `/api/retouched-image/${folderId}/${fileId}?v=${Date.now()}`;
  } catch {
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
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccount),
      });
    }
    db = getFirestore();
    return db;
  } catch (error: any) {
    console.error("Error parsing FIREBASE_SERVICE_ACCOUNT or initializing Firebase Admin:", error);
    throw new Error("Lỗi đọc cấu hình FIREBASE_SERVICE_ACCOUNT trên máy chủ: " + error.message);
  }
}

const getSafeDb = () => {
  try {
    return getDb();
  } catch {
    return null;
  }
};

const localAlbumsStore: Record<
  string,
  {
    selectedIds?: string[];
    annotations?: Record<string, any>;
    retouched?: Record<string, string>;
  }
> = {};

// API to get selected images and annotations for a folder
app.get("/api/albums/:folderId/selections", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const folderId = req.params.folderId;
  const currentDb = getSafeDb();

  if (!localAlbumsStore[folderId]) {
    localAlbumsStore[folderId] = loadAlbumFromDisk(folderId);
  }

  let selectedIds: string[] = localAlbumsStore[folderId]?.selectedIds || [];
  let annotations: Record<string, any> = localAlbumsStore[folderId]?.annotations || {};
  let retouched: Record<string, string> = localAlbumsStore[folderId]?.retouched || {};

  if (currentDb) {
    try {
      const doc = await currentDb.collection("albums").doc(folderId).get();
      if (doc.exists) {
        const data = doc.data();
        if (data?.selectedIds && Array.isArray(data.selectedIds)) {
          selectedIds = Array.from(new Set([...selectedIds, ...data.selectedIds]));
        }
        if (data?.annotations) {
          annotations = { ...annotations, ...data.annotations };
        }
        if (data?.retouched) {
          for (const [fId, val] of Object.entries(data.retouched)) {
            retouched[fId] = saveRetouchedImage(folderId, fId, val as string);
          }
        }
        localAlbumsStore[folderId] = { selectedIds, annotations, retouched };
        saveAlbumToDisk(folderId, localAlbumsStore[folderId]);
      }
    } catch (error) {
      console.warn("Could not fetch album data from Firestore:", error);
    }
  }

  res.json({ selectedIds, annotations, retouched });
});

// API to update selected images for a folder
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
      await currentDb.collection("albums").doc(folderId).set(
        {
          selectedIds,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.warn("Failed saving selections to Firestore:", error);
    }
  }

  res.json({ success: true, selectedIds });
});

// API to get annotations for a folder
app.get("/api/albums/:folderId/annotations", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const folderId = req.params.folderId;
  const currentDb = getSafeDb();

  if (!localAlbumsStore[folderId]) {
    localAlbumsStore[folderId] = loadAlbumFromDisk(folderId);
  }

  let annotations: Record<string, any> = localAlbumsStore[folderId]?.annotations || {};
  if (currentDb) {
    try {
      const doc = await currentDb.collection("albums").doc(folderId).get();
      if (doc.exists && doc.data()?.annotations) {
        annotations = { ...annotations, ...doc.data()?.annotations };
        localAlbumsStore[folderId].annotations = annotations;
        saveAlbumToDisk(folderId, localAlbumsStore[folderId]);
      }
    } catch {}
  }
  res.json({ annotations });
});

// API to update annotations for a folder
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
      await currentDb.collection("albums").doc(folderId).set(
        {
          annotations: localAlbumsStore[folderId].annotations,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch {}
  }

  res.json({ success: true, annotations: localAlbumsStore[folderId].annotations });
});

// API to get all retouched images for a folder
app.get("/api/albums/:folderId/retouched", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const folderId = req.params.folderId;
  const currentDb = getSafeDb();

  if (!localAlbumsStore[folderId]) {
    localAlbumsStore[folderId] = loadAlbumFromDisk(folderId);
  }

  let retouched: Record<string, string> = localAlbumsStore[folderId]?.retouched || {};
  if (currentDb) {
    try {
      const doc = await currentDb.collection("albums").doc(folderId).get();
      if (doc.exists && doc.data()?.retouched) {
        retouched = { ...retouched };
        for (const [fId, val] of Object.entries(doc.data()?.retouched)) {
          retouched[fId] = saveRetouchedImage(folderId, fId, val as string);
        }
        localAlbumsStore[folderId].retouched = retouched;
        saveAlbumToDisk(folderId, localAlbumsStore[folderId]);
      }
    } catch {}
  }
  res.json({ retouched });
});

// API to save a retouched image for a photo
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
      await currentDb.collection("albums").doc(folderId).set(
        {
          retouched: localAlbumsStore[folderId].retouched,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch {}
  }

  res.json({ success: true, retouched: localAlbumsStore[folderId].retouched, retouchedImageUrl: savedUrl });
});

// Endpoint to serve retouched image files
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

  const filePath = path.join(RETOUCHED_DIR, folderId, `${fileId}.jpg`);
  if (fs.existsSync(filePath)) {
    try {
      const buffer = fs.readFileSync(filePath);
      retouchedMemoryBuffers.set(cacheKey, { buffer, mimeType: "image/jpeg" });
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      return res.send(buffer);
    } catch {}
  }

  res.status(404).json({ error: "Retouched image not found" });
});

// API to run AI photo retouching via Gemini API using server-side GEMINI_API_KEY
app.post("/api/ai/retouch", async (req, res) => {
  try {
    const {
      folderId,
      fileId,
      imageBase64,
      mimeType = "image/jpeg",
      annotations = [],
      customPrompt,
      resolution = "2K",
    } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY chưa được cấu hình trong môi trường máy chủ.",
      });
    }

    if (!imageBase64) {
      return res.status(400).json({ error: "Thiếu dữ liệu hình ảnh (imageBase64)." });
    }

    const validResolution: "1K" | "2K" | "4K" =
      resolution === "1K" || resolution === "2K" || resolution === "4K" ? resolution : "2K";

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");

    let notesDescription =
      "Không có ghi chú cụ thể. Hãy tự động tối ưu ánh sáng, làm mịn da tự nhiên và làm nổi bật chủ thể chính.";
    if (Array.isArray(annotations) && annotations.length > 0) {
      notesDescription = annotations
        .map((item: any, idx: number) => {
          let locationStr = "";
          if (Array.isArray(item.points) && item.points.length > 0) {
            const xs = item.points.map((p: any) => p.x).filter((x: any) => typeof x === "number");
            const ys = item.points.map((p: any) => p.y).filter((y: any) => typeof y === "number");
            if (xs.length > 0 && ys.length > 0) {
              const minX = Math.round(Math.min(...xs) * 100);
              const maxX = Math.round(Math.max(...xs) * 100);
              const minY = Math.round(Math.min(...ys) * 100);
              const maxY = Math.round(Math.max(...ys) * 100);
              const centerX = Math.round((minX + maxX) / 2);
              const centerY = Math.round((minY + maxY) / 2);
              locationStr = ` [Vị trí khoanh đỏ: tọa độ tâm khoảng ${centerX}% ngang, ${centerY}% dọc từ trên xuống; vùng bounding box: x từ ${minX}% đến ${maxX}%, y từ ${minY}% đến ${maxY}%]`;
            }
          }
          return `${idx + 1}. [Yêu cầu #${idx + 1}]: "${item.note || "Chỉnh sửa vùng này"}"${locationStr}`;
        })
        .join("\n");
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
   - NEVER change the person's head tilt, neck angle, chin direction, or eye gaze!
3. ABSOLUTE IDENTITY & FACE PRESERVATION (STRICT & ZERO-ALTERATION):
   - CRITICAL: If a circled region does NOT circle a person's face or ask to retouch facial features, YOU MUST LEAVE ALL FACES 100% UNTOUCHED AND UNMODIFIED!
   - Maintain the EXACT original facial expression, teeth shape, smile lines, and authentic identity of each person.
4. MICRO-RETOUCH FOR STRAY HAIR & BLEMISHES:
   - When asked to remove a stray hair strand, ONLY erase the individual hair strand pixels and replace them with natural skin/fabric behind it.
5. LOCALIZED OBJECT & PERSON REMOVAL:
   - When asked to remove an unwanted person or object, ONLY inpaint and fill the background behind that specific region.
6. CLOTHING & DRESS PRESERVATION:
   - NEVER alter the clothing neckline, dress straps, or dress style.
7. NATURAL PHOTOREALISM:
   - Seamlessly blend lighting, grain, shadows, and color temperature so no editing seams or AI artifacts appear.
   - Output the final image in high-resolution (${validResolution}) studio quality.`;

    let generatedImageUrl: string | null = null;
    const primaryModel: string = validResolution === "1K" ? "gemini-3.1-flash-lite-image" : "gemini-nano-banana-2.1";
    const fallbackModel: string = validResolution === "1K" ? "gemini-nano-banana-2.1" : "gemini-3-pro-image";
    let modelUsed: string = primaryModel;

    try {
      const requestParams: any = {
        model: primaryModel,
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType || "image/jpeg",
              },
            },
            {
              text: prompt,
            },
          ],
        },
      };
      if (primaryModel === "gemini-nano-banana-2.1" || primaryModel === "gemini-3-pro-image") {
        requestParams.config = {
          imageConfig: {
            imageSize: validResolution,
          },
        };
      }

      const response = await ai.models.generateContent(requestParams);
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) {
          generatedImageUrl = `data:${part.inlineData.mimeType || "image/jpeg"};base64,${part.inlineData.data}`;
          break;
        }
      }
    } catch (firstError: any) {
      try {
        modelUsed = fallbackModel;
        const fallbackParams: any = {
          model: fallbackModel,
          contents: {
            parts: [
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType: mimeType || "image/jpeg",
                },
              },
              {
                text: prompt,
              },
            ],
          },
        };
        if (fallbackModel === "gemini-nano-banana-2.1" || fallbackModel === "gemini-3-pro-image") {
          fallbackParams.config = {
            imageConfig: {
              imageSize: validResolution,
            },
          };
        }

        const response = await ai.models.generateContent(fallbackParams);
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData?.data) {
            generatedImageUrl = `data:${part.inlineData.mimeType || "image/jpeg"};base64,${part.inlineData.data}`;
            break;
          }
        }
      } catch (fallbackError: any) {
        if (modelUsed !== "gemini-3.1-flash-lite-image") {
          try {
            modelUsed = "gemini-3.1-flash-lite-image";
            const finalResponse = await ai.models.generateContent({
              model: "gemini-3.1-flash-lite-image",
              contents: {
                parts: [
                  {
                    inlineData: {
                      data: cleanBase64,
                      mimeType: mimeType || "image/jpeg",
                    },
                  },
                  {
                    text: prompt,
                  },
                ],
              },
            });
            for (const part of finalResponse.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData?.data) {
                generatedImageUrl = `data:${part.inlineData.mimeType || "image/jpeg"};base64,${part.inlineData.data}`;
                break;
              }
            }
          } catch {}
        }

        if (!generatedImageUrl) {
          const rawError = firstError?.message || fallbackError?.message || String(fallbackError);
          throw new Error(`Lỗi từ Gemini AI: ${rawError}`);
        }
      }
    }

    if (!generatedImageUrl) {
      return res.status(502).json({
        error: "Không nhận được hình ảnh chỉnh sửa từ mô hình AI. Vui lòng kiểm tra lại ghi chú và thử lại.",
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
          await currentDb.collection("albums").doc(folderId).set(
            {
              retouched: localAlbumsStore[folderId].retouched,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch {}
      }
    }

    res.json({
      success: true,
      retouchedImageUrl: generatedImageUrl,
      savedEndpointUrl,
      modelUsed,
      resolutionUsed: validResolution,
      notesCount: annotations.length,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || "Đã xảy ra sự cố khi gọi Gemini AI xử lý ảnh.",
    });
  }
});

async function fetchPublicDriveFolderFallback(folderId: string) {
  const embedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
  const response = await fetch(embedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(
      "Không thể truy cập thư mục Google Drive. Hãy đảm bảo thư mục đã được bật chia sẻ công khai (Bất kỳ ai có đường liên kết)."
    );
  }
  const html = await response.text();
  const files: any[] = [];
  const entryRegex = /<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(html)) !== null) {
    const entryBlock = match[0];
    const id = match[1];
    const name = match[2].trim();
    const isImageMime =
      entryBlock.includes("type/image/") || /\.(jpe?g|png|webp|gif|bmp|heic|tiff?|avif)$/i.test(name);
    if (!isImageMime) continue;

    const thumbMatch = entryBlock.match(/<div class="flip-entry-thumb"><img src="([^"]+)"/);
    const thumbnailLink = thumbMatch?.[1]
      ? thumbMatch[1].replace(/=s\d+$/, "=s220")
      : `https://lh3.googleusercontent.com/d/${id}=s220`;

    files.push({
      id,
      name,
      thumbnailLink,
      webContentLink: `https://drive.google.com/uc?id=${id}&export=download`,
      createdTime: new Date().toISOString(),
    });
  }
  return files;
}

// API route to proxy Google Drive API requests
app.get("/api/drive/files", async (req, res) => {
  try {
    const folderId = req.query.folderId as string;
    const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

    if (!folderId) {
      return res.status(400).json({ error: "folderId is required" });
    }

    if (apiKey) {
      try {
        let allFiles: any[] = [];
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
      } catch (e) {
        console.warn("Drive API fallback triggered:", e);
      }
    }

    const fallbackFiles = await fetchPublicDriveFolderFallback(folderId);
    res.json({ files: fallbackFiles });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Proxy image route to bypass CORS
app.get("/api/proxy-image", async (req, res) => {
  try {
    const url = req.query.url as string;
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
  } catch {
    res.status(500).send("Error proxying image");
  }
});

function getOrCreateUserRecord(input: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  role?: "admin" | "vip" | "user";
}): StoredUserRecord {
  const cleanEmail = (input.email || "").trim().toLowerCase();
  const isOwnerAdmin = cleanEmail === "huyitcom@gmail.com";

  let targetUid = input.uid;
  let existing = creditsStore.users[targetUid];
  if (!existing && cleanEmail) {
    const foundEntry = Object.values(creditsStore.users).find((u) => u.email?.toLowerCase() === cleanEmail);
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

  const nowIso = new Date().toISOString();
  if (existing) {
    const updatedRole: "admin" | "vip" | "user" =
      isOwnerAdmin || existing.role === "admin"
        ? "admin"
        : input.role === "vip" || existing.role === "vip"
        ? "vip"
        : existing.role || "user";

    const record: StoredUserRecord = {
      ...existing,
      uid: targetUid,
      email: cleanEmail || existing.email,
      displayName: input.displayName || existing.displayName || cleanEmail.split("@")[0] || "Khách hàng",
      photoURL: input.photoURL !== undefined ? input.photoURL : existing.photoURL,
      role: updatedRole,
      credits: typeof existing.credits === "number" ? existing.credits : 3,
      renderCount: typeof existing.renderCount === "number" ? existing.renderCount : 0,
      lastLoginAt: nowIso,
    };
    creditsStore.users[targetUid] = record;
    saveCreditsStore(creditsStore);
    return record;
  }

  const initialRole: "admin" | "vip" | "user" = isOwnerAdmin
    ? "admin"
    : input.role === "vip"
    ? "vip"
    : "user";
  const initialCredits = isOwnerAdmin ? 25 : 3;

  const newRecord: StoredUserRecord = {
    uid: input.uid,
    email: cleanEmail || `${input.uid}@photobook.vn`,
    displayName:
      input.displayName || (isOwnerAdmin ? "Lê Khắc Huy" : cleanEmail.split("@")[0] || "Khách hàng mới"),
    photoURL: input.photoURL || null,
    role: initialRole,
    credits: initialCredits,
    renderCount: 0,
    createdAt: nowIso,
    lastLoginAt: nowIso,
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
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch {}
    }

    res.json({ success: true, user: record });
  } catch (err: any) {
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
            role: data.role || record?.role,
          });
          if (typeof data.credits === "number" && data.credits > record.credits) {
            record.credits = data.credits;
            creditsStore.users[uid] = record;
            saveCreditsStore(creditsStore);
          }
        }
      } catch {}
    }
    if (!record) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true, user: record });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Error fetching user credits" });
  }
});

app.post("/api/credits/consume", async (req, res) => {
  try {
    const { uid, email, displayName, resolution, fileId, fileName, folderId, notesCount } = req.body || {};
    if (!uid) {
      return res.status(400).json({ error: "uid is required" });
    }

    const validRes: "1K" | "2K" | "4K" =
      resolution === "4K" ? "4K" : resolution === "1K" ? "1K" : "2K";
    const cost = validRes === "4K" ? 3 : validRes === "2K" ? 2 : 1;

    const user = getOrCreateUserRecord({ uid, email, displayName });
    const currentDb = getSafeDb();
    if (currentDb) {
      try {
        const snap = await currentDb.collection("users").doc(uid).get();
        if (snap.exists && typeof snap.data()?.credits === "number") {
          user.credits = snap.data().credits;
        }
      } catch {}
    }

    if (user.credits < cost) {
      return res.status(402).json({
        error: `Số dư lượt Render AI không đủ (Cần ${cost} lượt cho ảnh ${validRes}, hiện còn ${user.credits} lượt). Vui lòng nạp thêm lượt!`,
        insufficientCredits: true,
        requiredCredits: cost,
        currentCredits: user.credits,
      });
    }

    user.credits = Math.max(0, user.credits - cost);
    user.renderCount = (user.renderCount || 0) + 1;
    creditsStore.users[uid] = user;

    const logItem: StoredRenderLog = {
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
      createdAt: new Date().toISOString(),
    };

    creditsStore.renderLogs.unshift(logItem);
    if (creditsStore.renderLogs.length > 300) {
      creditsStore.renderLogs = creditsStore.renderLogs.slice(0, 300);
    }
    saveCreditsStore(creditsStore);

    if (currentDb) {
      try {
        await currentDb.collection("users").doc(uid).set(
          {
            credits: user.credits,
            renderCount: user.renderCount,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        await currentDb.collection("render_logs").doc(logItem.id).set(logItem);
      } catch {}
    }

    res.json({
      success: true,
      cost,
      credits: user.credits,
      renderCount: user.renderCount,
      user,
      log: logItem,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to consume credits" });
  }
});

async function fulfillPaidOrder(
  orderCodeNum: number,
  approvedBy = "PayOS Auto Webhook"
): Promise<{
  order: StoredTopupOrder;
  user: StoredUserRecord;
} | null> {
  const key = String(orderCodeNum);
  let order = creditsStore.orders[key];
  const currentDb = getSafeDb();

  if (!order && currentDb) {
    try {
      const snap = await currentDb.collection("topup_orders").doc(key).get();
      if (snap.exists) {
        order = snap.data() as StoredTopupOrder;
        creditsStore.orders[key] = order;
      }
    } catch {}
  }

  if (!order) return null;

  const user = getOrCreateUserRecord({
    uid: order.uid,
    email: order.email,
    displayName: order.displayName,
  });

  if (order.status === "PAID") {
    return { order, user };
  }

  order.status = "PAID";
  order.paidAt = new Date().toISOString();
  order.approvedBy = approvedBy;
  creditsStore.orders[key] = order;

  user.credits = (user.credits || 0) + Number(order.credits || 0);
  if (user.role === "user") {
    user.role = "vip";
  }
  creditsStore.users[user.uid] = user;
  saveCreditsStore(creditsStore);

  if (currentDb) {
    try {
      await currentDb.collection("topup_orders").doc(key).set(order, { merge: true });
      await currentDb.collection("users").doc(user.uid).set(
        {
          credits: user.credits,
          role: user.role,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch {}
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
    const bankName = "MB Bank (Quân Đội)";
    const accountNumber = "0007979999999";
    const accountName = "LE KHAC HUY";

    const qrImageUrl = `https://img.vietqr.io/image/${bankId}-${accountNumber}-compact2.png?amount=${Number(
      amount
    )}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountName)}`;

    const appBaseUrl = process.env.APP_URL || "https://photobook.vn";
    let checkoutUrl = `https://img.vietqr.io/image/${bankId}-${accountNumber}-print.png?amount=${Number(
      amount
    )}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountName)}`;

    const payosClientId = process.env.PAYOS_CLIENT_ID;
    const payosApiKey = process.env.PAYOS_API_KEY;
    const payosChecksumKey = process.env.PAYOS_CHECKSUM_KEY;

    if (payosClientId && payosApiKey && payosChecksumKey) {
      try {
        const cancelUrl = `${appBaseUrl.replace(/\/$/, "")}/?topup=cancelled`;
        const returnUrl = `${appBaseUrl.replace(/\/$/, "")}/?topup=success&orderCode=${orderCode}`;
        const description = transferContent.slice(0, 25);
        const signData = `amount=${Number(amount)}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
        const signature = crypto.createHmac("sha256", payosChecksumKey).update(signData).digest("hex");

        const payosRes = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
          method: "POST",
          headers: {
            "x-client-id": payosClientId,
            "x-api-key": payosApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderCode,
            amount: Number(amount),
            description,
            cancelUrl,
            returnUrl,
            signature,
          }),
        });

        const payosJson: any = await payosRes.json();
        if (payosRes.ok && payosJson?.data?.checkoutUrl) {
          checkoutUrl = payosJson.data.checkoutUrl;
        }
      } catch {}
    }

    const newOrder: StoredTopupOrder = {
      orderCode,
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      packageId: packageId || `pkg_${credits}`,
      packageName: packageName || `Gói +${credits} lượt`,
      credits: Number(credits),
      amount: Number(amount),
      transferContent,
      bankName,
      accountNumber,
      accountName,
      qrImageUrl,
      checkoutUrl,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };

    creditsStore.orders[String(orderCode)] = newOrder;
    saveCreditsStore(creditsStore);

    const currentDb = getSafeDb();
    if (currentDb) {
      try {
        await currentDb.collection("topup_orders").doc(String(orderCode)).set(newOrder);
      } catch {}
    }

    res.json({
      success: true,
      order: newOrder,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Không thể khởi tạo mã VietQR PayOS" });
  }
});

app.get("/api/payos/order/:orderCode", async (req, res) => {
  try {
    const orderCode = Number(req.params.orderCode);
    const key = String(orderCode);
    let order = creditsStore.orders[key];
    const currentDb = getSafeDb();

    if (!order && currentDb) {
      try {
        const snap = await currentDb.collection("topup_orders").doc(key).get();
        if (snap.exists) {
          order = snap.data() as StoredTopupOrder;
          creditsStore.orders[key] = order;
        }
      } catch {}
    }

    if (!order) {
      return res.status(404).json({ error: "Không tìm thấy đơn nạp lượt" });
    }

    if (order.status !== "PAID") {
      const payosClientId = process.env.PAYOS_CLIENT_ID;
      const payosApiKey = process.env.PAYOS_API_KEY;
      if (payosClientId && payosApiKey) {
        try {
          const checkRes = await fetch(`https://api-merchant.payos.vn/v2/payment-requests/${orderCode}`, {
            headers: {
              "x-client-id": payosClientId,
              "x-api-key": payosApiKey,
            },
          });
          if (checkRes.ok) {
            const checkJson: any = await checkRes.json();
            if (checkJson?.data?.status === "PAID") {
              const fulfilled = await fulfillPaidOrder(orderCode, "PayOS Auto API");
              if (fulfilled) {
                return res.json({ success: true, order: fulfilled.order, user: fulfilled.user });
              }
            }
          }
        } catch {}
      }
    }

    const user = creditsStore.users[order.uid];
    res.json({
      success: true,
      order,
      user,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Lỗi kiểm tra trạng thái giao dịch" });
  }
});

app.post("/api/payos/order/:orderCode/confirm-transfer", async (req, res) => {
  try {
    const orderCode = Number(req.params.orderCode);
    const key = String(orderCode);
    let order = creditsStore.orders[key];
    const currentDb = getSafeDb();

    if (!order && currentDb) {
      try {
        const snap = await currentDb.collection("topup_orders").doc(key).get();
        if (snap.exists) {
          order = snap.data() as StoredTopupOrder;
          creditsStore.orders[key] = order;
        }
      } catch {}
    }

    if (!order) {
      return res.status(404).json({ error: "Không tìm thấy đơn giao dịch" });
    }

    if (order.status === "PAID") {
      return res.json({
        success: true,
        order,
        user: creditsStore.users[order.uid],
      });
    }

    order.status = "WAITING_APPROVAL";
    order.userReportedAt = new Date().toISOString();
    creditsStore.orders[key] = order;
    saveCreditsStore(creditsStore);

    if (currentDb) {
      try {
        await currentDb.collection("topup_orders").doc(key).set(order, { merge: true });
      } catch {}
    }

    res.json({
      success: true,
      order,
      user: creditsStore.users[order.uid],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Lỗi xác nhận chuyển khoản" });
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
  } catch {
    res.status(200).json({ error: 0, message: "Handled" });
  }
});

function mergeFirestoreUsersList(rawUsers: any[]) {
  let changed = false;
  for (const d of rawUsers) {
    if (!d) continue;
    const uid = String(d.uid || d.id || "").trim();
    if (!uid) continue;

    const cleanEmail = String(d.email || "").trim().toLowerCase();
    const isOwnerAdmin = cleanEmail === "huyitcom@gmail.com" || cleanEmail.includes("huyitcom");
    const defaultRole: "admin" | "vip" | "user" = isOwnerAdmin
      ? "admin"
      : d.role === "admin" || d.role === "vip"
      ? d.role
      : "user";
    const defaultCredits = isOwnerAdmin ? 25 : 3;

    let syntheticMatch: StoredUserRecord | undefined;
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
        displayName: d.displayName || (d.email ? d.email.split("@")[0] : "Khách hàng"),
        photoURL: d.photoURL || null,
        role: defaultRole,
        credits: typeof d.credits === "number" ? d.credits : defaultCredits,
        renderCount: typeof d.renderCount === "number" ? d.renderCount : 0,
        createdAt: d.createdAt || new Date().toISOString(),
        lastLoginAt: d.lastLoginAt || d.createdAt || new Date().toISOString(),
      };
      changed = true;
    } else {
      const mergedRole: "admin" | "vip" | "user" =
        isOwnerAdmin || existing.role === "admin" || d.role === "admin"
          ? "admin"
          : existing.role === "vip" || d.role === "vip"
          ? "vip"
          : "user";

      creditsStore.users[uid] = {
        ...existing,
        uid,
        email: d.email || existing.email || `${uid}@photobook.vn`,
        displayName: d.displayName || existing.displayName || "Khách hàng",
        photoURL: d.photoURL || existing.photoURL || null,
        role: mergedRole,
        credits:
          typeof existing.credits === "number"
            ? existing.credits
            : typeof d.credits === "number"
            ? d.credits
            : defaultCredits,
        renderCount:
          typeof existing.renderCount === "number"
            ? Math.max(existing.renderCount, typeof d.renderCount === "number" ? d.renderCount : 0)
            : typeof d.renderCount === "number"
            ? d.renderCount
            : 0,
        createdAt: d.createdAt || existing.createdAt || new Date().toISOString(),
      };
      changed = true;
    }
  }

  if (changed) {
    saveCreditsStore(creditsStore);
  }
}

async function fetchFirestoreUsersViaRest(): Promise<any[]> {
  try {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "photo-picker-507413";
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?pageSize=300`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data: any = await resp.json();
    const docs = Array.isArray(data?.documents) ? data.documents : [];
    return docs.map((docItem: any) => {
      const nameParts = String(docItem.name || "").split("/");
      const docId = nameParts[nameParts.length - 1] || "";
      const fields = docItem.fields || {};
      const getStr = (f: any) => f?.stringValue ?? null;
      const getNum = (f: any) =>
        f?.integerValue !== undefined
          ? Number(f.integerValue)
          : f?.doubleValue !== undefined
          ? Number(f.doubleValue)
          : undefined;
      const getTime = (f: any) => f?.timestampValue || f?.stringValue || undefined;

      return {
        uid: getStr(fields.uid) || docId,
        email: getStr(fields.email),
        displayName: getStr(fields.displayName),
        photoURL: getStr(fields.photoURL),
        role: getStr(fields.role),
        credits: getNum(fields.credits),
        renderCount: getNum(fields.renderCount),
        createdAt: getTime(fields.createdAt) || docItem.createTime,
        lastLoginAt: getTime(fields.lastLoginAt) || docItem.updateTime,
      };
    });
  } catch {
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
    renderLogs: creditsStore.renderLogs || [],
  };
}

app.get("/api/admin/overview", async (_req, res) => {
  try {
    const currentDb = getSafeDb();
    if (currentDb) {
      try {
        const usersSnap = await currentDb.collection("users").get();
        const fbUsers: any[] = [];
        usersSnap.forEach((docSnap: any) => {
          const d = docSnap.data();
          if (d) {
            fbUsers.push({ ...d, uid: d.uid || docSnap.id });
          }
        });
        mergeFirestoreUsersList(fbUsers);
      } catch {}
    } else {
      const restUsers = await fetchFirestoreUsersViaRest();
      if (restUsers.length > 0) {
        mergeFirestoreUsersList(restUsers);
      }
    }

    res.json(buildAdminOverviewResponse());
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Lỗi tải dữ liệu quản trị" });
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Lỗi đồng bộ danh sách thành viên từ Firebase" });
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
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch {}
    }

    res.json({
      success: true,
      user,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Không thể cập nhật số lượt" });
  }
});

app.post("/api/admin/orders/:orderCode/approve", async (req, res) => {
  try {
    const orderCode = Number(req.params.orderCode);
    const { adminEmail } = req.body || {};
    const fulfilled = await fulfillPaidOrder(orderCode, adminEmail || "Admin Duyệt VietQR");
    if (!fulfilled) {
      return res.status(404).json({ error: "Không tìm thấy đơn nạp VietQR" });
    }
    res.json({
      success: true,
      order: fulfilled.order,
      user: fulfilled.user,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Lỗi duyệt đơn nạp VietQR" });
  }
});

app.post("/api/admin/orders/:orderCode/reject", async (req, res) => {
  try {
    const orderCode = Number(req.params.orderCode);
    const key = String(orderCode);
    const order = creditsStore.orders[key];
    if (!order) {
      return res.status(404).json({ error: "Không tìm thấy đơn nạp VietQR" });
    }
    order.status = "CANCELLED";
    creditsStore.orders[key] = order;
    saveCreditsStore(creditsStore);

    const currentDb = getSafeDb();
    if (currentDb) {
      try {
        await currentDb.collection("topup_orders").doc(key).set(order, { merge: true });
      } catch {}
    }

    res.json({
      success: true,
      order,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Lỗi từ chối đơn nạp" });
  }
});

// Ensure any unmatched /api route or middleware error returns JSON instead of <!DOCTYPE html>
app.use((req, res) => {
  res.status(404).json({
    error: `API endpoint không tồn tại (${req.method} ${req.originalUrl || req.url}). Vui lòng đồng bộ code mới nhất lên GitHub/Vercel và bấm Redeploy.`,
  });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Vercel API Error]:", err);
  res.status(err?.status || 500).json({
    error: err?.message || "Lỗi máy chủ khi xử lý yêu cầu API.",
  });
});

export default app;
