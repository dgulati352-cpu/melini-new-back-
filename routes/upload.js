import express from "express";
import { verifyAdmin } from "../middleware/auth.js";
import https from "https";

const router = express.Router();

const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "melini-1810e.firebasestorage.app";
const UPLOAD_URL = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o`;

// Helper: upload buffer to Firebase Storage REST API (no auth required for public buckets)
async function uploadToFirebase(buffer, fileName, contentType) {
  const encodedName = encodeURIComponent(`uploads/${fileName}`);
  const url = `${UPLOAD_URL}?uploadType=media&name=${encodedName}`;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.name) {
            const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(parsed.name)}?alt=media`;
            resolve(downloadURL);
          } else {
            reject(new Error(parsed.error?.message || "Firebase upload failed: " + data));
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

// Secure image upload (Admin Protected)
router.post("/upload", verifyAdmin, async (req, res) => {
  try {
    let buffer;
    let contentType = "image/jpeg";
    let fileName = `img_${Date.now()}.jpg`;

    if (req.files && req.files.file) {
      const file = req.files.file;
      // Use in-memory buffer — Vercel serverless has no writable filesystem
      buffer = file.data;
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

    console.log(`Uploading ${fileName} (${contentType}) to Firebase Storage...`);
    const downloadURL = await uploadToFirebase(buffer, fileName, contentType);
    console.log("Upload successful:", downloadURL);

    res.json({ url: downloadURL });
  } catch (err) {
    console.error("Upload failed:", err.message);
    res.status(500).json({ error: "Image upload failed", details: err.message });
  }
});

// Delete image from Firebase Storage (Admin Protected)
router.delete("/upload", verifyAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Image URL is required" });

    // Extract the object path from the URL
    const match = url.match(/\/o\/([^?]+)/);
    if (!match) return res.status(400).json({ error: "Invalid Firebase Storage URL" });

    const objectPath = decodeURIComponent(match[1]);
    const deleteUrl = `${UPLOAD_URL}/${encodeURIComponent(objectPath)}`;

    const urlObj = new URL(deleteUrl);
    await new Promise((resolve, reject) => {
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: "DELETE",
      };
      const req = https.request(options, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve());
      });
      req.on("error", reject);
      req.end();
    });

    console.log("Deleted from Firebase Storage:", objectPath);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete failed:", err.message);
    res.status(500).json({ error: "Failed to delete image", details: err.message });
  }
});

export default router;
