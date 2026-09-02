import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

let db: admin.firestore.Firestore | null = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    db = admin.firestore();
    console.log("Firebase Admin initialized successfully.");
  } catch (error) {
    console.error("Error parsing FIREBASE_SERVICE_ACCOUNT or initializing Firebase Admin:", error);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to get selected images for a folder
  app.get("/api/albums/:folderId/selections", async (req, res) => {
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

  // API to update selected images for a folder
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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

      // Fetch up to 5 pages (5000 images) to prevent infinite loops
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
            error:
              "Failed to fetch from Google Drive. Ensure the folder is public and the ID is correct.",
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Static asset serving for production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
