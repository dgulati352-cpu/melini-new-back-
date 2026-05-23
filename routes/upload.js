import express from "express";
import { verifyAdmin } from "../middleware/auth.js";
import { getAuthToken } from "../firebase.js";
import https from "https";

const router = express.Router();

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "melini-1810e.firebasestorage.app";

// Helper: upload buffer to Firebase Storage REST API with auth token
async function uploadToFirebase(buffer, fileName, contentType) {
  const token = await getAuthToken();
  const objectName = `uploads/${fileName}`;
  const encodedName = encodeURIComponent(objectName);
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodedName}`;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const headers = {
      "Content-Type": contentType,
      "Content-Length": buffer.length,
    };
    if (token) headers["Authorization"] = `Firebase ${token}`;

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.name) {
            const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(parsed.name)}?alt=media&token=${token}`;
            resolve(downloadURL);
          } else {
            reject(new Error(`Firebase upload error (${res.statusCode}): ${parsed.error?.message || data}`));
          }
        } catch (e) {
          reject(new Error("Firebase response parse error: " + data));
        }
      });
    });

    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
}

// Helper: delete object from Firebase Storage REST API with auth token
async function deleteFromFirebase(objectPath) {
  const token = await getAuthToken();
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}`;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "DELETE",
      headers: token ? { "Authorization": `Firebase ${token}` } : {},
    };
    const req = https.request(options, (res) => {
      res.on("data", () => {});
      res.on("end", () => resolve());
    });
    req.on("error", reject);
    req.end();
  });
}

// POST /api/upload — Secure image upload (Admin Protected)
router.post("/upload", verifyAdmin, async (req, res) => {
  try {
    let buffer;
    let contentType = "image/jpeg";
    let fileName = `img_${Date.now()}.jpg`;

    if (req.files && req.files.file) {
      const file = req.files.file;
      buffer = file.data; // In-memory buffer (no temp files — Vercel has read-only FS)
      contentType = file.mimetype;
      fileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    } else if (req.body.data) {
      const base64Data = req.body.data;
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        contentType = matches[1];
        buffer = Buffer.from(matches[2], "base64");
        const ext = contentType.split("/")[1] || "jpg";
        fileName = `img_${Date.now()}.${ext}`;
      } else {
        buffer = Buffer.from(base64Data, "base64");
      }
    } else {
      return res.status(400).json({ error: "No image file or base64 data provided" });
    }

    console.log(`Uploading ${fileName} (${contentType}, ${buffer.length} bytes) to Firebase Storage...`);
    const downloadURL = await uploadToFirebase(buffer, fileName, contentType);
    console.log("Upload successful:", downloadURL);

    res.json({ url: downloadURL });
  } catch (err) {
    console.error("Upload failed:", err.message);
    res.status(500).json({ error: "Image upload failed", details: err.message });
  }
});

// DELETE /api/upload — Delete image (Admin Protected)
router.delete("/upload", verifyAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Image URL is required" });

    const match = url.match(/\/o\/([^?]+)/);
    if (!match) return res.status(400).json({ error: "Invalid Firebase Storage URL" });

    const objectPath = decodeURIComponent(match[1]);
    console.log("Deleting from Firebase Storage:", objectPath);
    await deleteFromFirebase(objectPath);

    res.json({ success: true });
  } catch (err) {
    console.error("Delete failed:", err.message);
    res.status(500).json({ error: "Failed to delete image", details: err.message });
  }
});

export default router;
