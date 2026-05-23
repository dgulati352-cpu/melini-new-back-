import express from "express";
import { verifyAdmin } from "../middleware/auth.js";
import https from "https";

const router = express.Router();

// Imgur anonymous upload - free, permanent URLs, no account needed
// Using a registered Imgur client ID (public, read-only key for uploads)
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID || "546c25a59c58ad7";

async function uploadToImgur(buffer, contentType) {
  const base64 = buffer.toString("base64");

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ image: base64, type: "base64" });

    const options = {
      hostname: "api.imgur.com",
      path: "/3/image",
      method: "POST",
      headers: {
        "Authorization": `Client-ID ${IMGUR_CLIENT_ID}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.success && parsed.data?.link) {
            // Convert to HTTPS
            const url = parsed.data.link.replace("http://", "https://");
            resolve(url);
          } else {
            reject(new Error(`Imgur upload error: ${parsed.data?.error || JSON.stringify(parsed)}`));
          }
        } catch (e) {
          reject(new Error("Imgur response parse error: " + data));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// POST /api/upload — Secure image upload (Admin Protected)
router.post("/upload", verifyAdmin, async (req, res) => {
  try {
    let buffer;
    let contentType = "image/jpeg";

    if (req.files && req.files.file) {
      const file = req.files.file;
      buffer = file.data; // In-memory buffer (Vercel has read-only filesystem)
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

    console.log(`Uploading image (${contentType}, ${buffer.length} bytes) to Imgur...`);
    const url = await uploadToImgur(buffer, contentType);
    console.log("Upload successful:", url);
    res.json({ url });
  } catch (err) {
    console.error("Upload failed:", err.message);
    res.status(500).json({ error: "Image upload failed", details: err.message });
  }
});

// DELETE /api/upload — unlink image from product (deletion from Imgur needs auth token, skip)
router.delete("/upload", verifyAdmin, async (req, res) => {
  res.json({ success: true, message: "Image unlinked" });
});

export default router;
