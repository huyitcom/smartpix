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

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_firebase_admin = __toESM(require("firebase-admin"), 1);
import_dotenv.default.config();
var db = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!import_firebase_admin.default.apps.length) {
      import_firebase_admin.default.initializeApp({
        credential: import_firebase_admin.default.credential.cert(serviceAccount)
      });
    }
    db = import_firebase_admin.default.firestore();
    console.log("Firebase Admin initialized successfully.");
  } catch (error) {
    console.error("Error parsing FIREBASE_SERVICE_ACCOUNT or initializing Firebase Admin:", error);
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.get("/api/albums/:folderId/selections", async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const folderId = req.params.folderId;
    if (!db) {
      return res.status(500).json({ error: "Database not configured on server" });
    }
    try {
      const doc = await db.collection("albums").doc(folderId).get();
      if (doc.exists) {
        res.json({ selectedIds: doc.data()?.selectedIds || [] });
      } else {
        res.json({ selectedIds: [] });
      }
    } catch (error) {
      console.error("Error fetching selections from Firestore:", error);
      res.status(500).json({ error: "Failed to fetch selections" });
    }
  });
  app.post("/api/albums/:folderId/selections", async (req, res) => {
    const folderId = req.params.folderId;
    const { selectedIds } = req.body;
    if (!Array.isArray(selectedIds)) {
      return res.status(400).json({ error: "selectedIds must be an array" });
    }
    if (!db) {
      return res.status(500).json({ error: "Database not configured on server" });
    }
    try {
      await db.collection("albums").doc(folderId).set({
        selectedIds,
        updatedAt: import_firebase_admin.default.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      res.json({ success: true, selectedIds });
    } catch (error) {
      console.error("Error saving selections to Firestore:", error);
      res.status(500).json({ error: "Failed to save selections" });
    }
  });
  app.get("/api/drive/files", async (req, res) => {
    try {
      const folderId = req.query.folderId;
      const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GOOGLE_DRIVE_API_KEY is not configured on the server." });
      }
      if (!folderId) {
        return res.status(400).json({ error: "folderId is required" });
      }
      let allFiles = [];
      let pageToken = "";
      let pages = 0;
      do {
        const url = new URL("https://www.googleapis.com/drive/v3/files");
        url.searchParams.append(
          "q",
          `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`
        );
        url.searchParams.append(
          "fields",
          "nextPageToken, files(id, name, thumbnailLink, webContentLink)"
        );
        url.searchParams.append("pageSize", "1000");
        url.searchParams.append("key", apiKey);
        if (pageToken) {
          url.searchParams.append("pageToken", pageToken);
        }
        const response = await fetch(url.toString());
        if (!response.ok) {
          const errorData = await response.text();
          console.error("Drive API error:", errorData);
          return res.status(response.status).json({
            error: "Failed to fetch from Google Drive. Ensure the folder is public and the ID is correct."
          });
        }
        const data = await response.json();
        if (data.files) {
          allFiles = allFiles.concat(data.files);
        }
        pageToken = data.nextPageToken;
        pages++;
      } while (pageToken && pages < 5);
      res.json({ files: allFiles });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message || "Internal server error" });
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
