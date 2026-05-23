import express from "express";
import { verifyAdmin } from "../middleware/auth.js";
import { db } from "../firebase.js";
import { ref, set, get, remove } from "firebase/database";

const router = express.Router();

// GET /api/images/:id — Serve image from Firebase Realtime Database (Public)
router.get("/images/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const imageRef = ref(db, `images/${id}`);
    const snapshot = await get(imageRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "Image not found" });
    }

    const { mime, data } = snapshot.val();
    const buffer = Buffer.from(data, "base64");

    // Cache image in browser for 1 year to ensure high performance
    res.setHeader("Content-Type", mime || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buffer);
  } catch (err) {
    console.error("Serve image failed:", err.message);
    res.status(500).json({ error: "Failed to retrieve image" });
  }
});

// POST /api/upload — Upload image (Admin Protected)
router.post("/upload", verifyAdmin, async (req, res) => {
  try {
    let buffer;
    let contentType = "image/jpeg";

    if (req.files && req.files.file) {
      const file = req.files.file;
      buffer = file.data;
      contentType = file.mimetype;
    } else if (req.body.data) {
      const base64Data = req.body.data;
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        contentType = matches[1];
        buffer = Buffer.from(matches[2], "base64");
      } else {
        buffer = Buffer.from(base64Data, "base64");
      }
    } else {
      return res.status(400).json({ error: "No image file or base64 data provided" });
    }

    // Generate unique image ID
    const imgId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const base64Str = buffer.toString("base64");

    console.log(`Saving image ${imgId} (${contentType}, ${buffer.length} bytes) to Firebase RTDB...`);
    
    // Save image to RTDB
    const imageRef = ref(db, `images/${imgId}`);
    await set(imageRef, {
      mime: contentType,
      data: base64Str,
      uploadedAt: Date.now()
    });

    // Construct public image serving URL
    const host = req.get("host");
    const protocol = req.protocol;
    const downloadURL = `${protocol}://${host}/api/images/${imgId}`;
    
    console.log("Upload successful. Served via URL:", downloadURL);
    res.json({ url: downloadURL });
  } catch (err) {
    console.error("Upload failed:", err.message);
    res.status(500).json({ error: "Image upload failed", details: err.message });
  }
});

// DELETE /api/upload — Delete image from Database (Admin Protected)
router.delete("/upload", verifyAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Image URL is required" });

    // Extract image ID from URL
    const match = url.match(/\/api\/images\/([^/?]+)/);
    if (!match) return res.status(400).json({ error: "Invalid image URL" });

    const imgId = match[1];
    console.log("Deleting image from Firebase RTDB:", imgId);
    
    const imageRef = ref(db, `images/${imgId}`);
    await remove(imageRef);

    res.json({ success: true, message: "Image deleted successfully" });
  } catch (err) {
    console.error("Delete failed:", err.message);
    res.status(500).json({ error: "Failed to delete image", details: err.message });
  }
});

export default router;
