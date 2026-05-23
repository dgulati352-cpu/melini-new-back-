import express from "express";
import cloudinary from "../config/cloudinary.js";
import { verifyAdmin } from "../middleware/auth.js";

const router = express.Router();

// Secure image upload (Admin Protected)
router.post("/upload", verifyAdmin, async (req, res) => {
  try {
    let uploadPath;

    if (req.files && req.files.file) {
      uploadPath = req.files.file.tempFilePath;
    } else if (req.body.data) {
      uploadPath = req.body.data; // Base64 data support
    } else {
      return res.status(400).json({ error: "No image file or base64 data uploaded" });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ error: "Cloudinary storage configuration is missing on server" });
    }

    console.log("Initiating Cloudinary upload stream...");
    const result = await cloudinary.uploader.upload(uploadPath, {
      folder: "melini",
      resource_type: "auto"
    });

    console.log("Cloudinary upload successful, secure url generated:", result.secure_url);
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error("Cloudinary upload stream exception:", err);
    res.status(500).json({ error: "Image storage upload failed", details: err.message });
  }
});

// Delete image from Cloudinary (Admin Protected)
router.delete("/upload", verifyAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL of image to delete is required" });

    // Extract public_id from Cloudinary asset URL
    const parts = url.split("/");
    const filename = parts[parts.length - 1].split(".")[0];
    const folder = parts[parts.length - 2];
    const publicId = `${folder}/${filename}`;

    console.log("Initiating Cloudinary asset deletion for:", publicId);
    const result = await cloudinary.uploader.destroy(publicId);
    res.json({ success: true, result });
  } catch (err) {
    console.error("Cloudinary delete asset exception:", err);
    res.status(500).json({ error: "Failed to delete image storage asset", details: err.message });
  }
});

export default router;
