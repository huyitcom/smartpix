import express from "express";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const app = express();
app.use(express.json());

let db: any = null;

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
        credential: cert(serviceAccount)
      });
    }
    db = getFirestore();
    return db;
  } catch (error: any) {
    console.error("Error parsing FIREBASE_SERVICE_ACCOUNT or initializing Firebase Admin:", error);
    throw new Error("Lỗi đọc cấu hình FIREBASE_SERVICE_ACCOUNT trên máy chủ: " + error.message);
  }
}

// API to get selected images for a folder
app.get("/api/albums/:folderId/selections", async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  const folderId = req.params.folderId;
  let currentDb;
  try {
    currentDb = getDb();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  try {
    const doc = await currentDb.collection("albums").doc(folderId).get();
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

// API to update selected images for a folder
app.post("/api/albums/:folderId/selections", async (req, res) => {
  const folderId = req.params.folderId;
  const { selectedIds } = req.body;
  
  if (!Array.isArray(selectedIds)) {
    return res.status(400).json({ error: "selectedIds must be an array" });
  }
  
  let currentDb;
  try {
    currentDb = getDb();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  try {
    await currentDb.collection("albums").doc(folderId).set({
      selectedIds,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    res.json({ success: true, selectedIds });
  } catch (error) {
    console.error("Error saving selections to Firestore:", error);
    res.status(500).json({ error: "Failed to save selections" });
  }
});

// API route to proxy Google Drive API requests
app.get("/api/drive/files", async (req, res) => {
  try {
    const folderId = req.query.folderId as string;
    const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
    
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "GOOGLE_DRIVE_API_KEY is not configured on the server." });
    }
    if (!folderId) {
      return res.status(400).json({ error: "folderId is required" });
    }

    let allFiles: any[] = [];
    let pageToken = "";
    
    // Fetch up to 5 pages (5000 images)
    let pages = 0;
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
        console.error("Drive API error:", errorData);
        return res.status(response.status).json({
          error: "Failed to fetch from Google Drive. Ensure the folder is public and the ID is correct.",
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
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default app;
