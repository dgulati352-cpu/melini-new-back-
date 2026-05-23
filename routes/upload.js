import express from "express";
import cloudinary from "../config/cloudinary.js";
import { verifyAdmin } from "../middleware/auth.js";
import { storage } from "../firebase.js";
import fs from "fs";

const router = express.Router();

// Secure image upload (Admin Protected)
router.post("/upload", verifyAdmin, async (req, res) => {
  try {
    let uploadPath;
    let isFile = false;

    if (req.files && req.files.file) {
      uploadPath = req.files.file.tempFilePath;
      isFile = true;
    } else if (req.body.data) {
      uploadPath = req.body.data; // Base64 data support
    } else {
      return res.status(400).json({ error: "No image file or base64 data uploaded" });
    }

    let downloadURL;

    if (process.env.CLOUDINARY_CLOUD_NAME) {
      console.log("Initiating Cloudinary upload stream...");
      const result = await cloudinary.uploader.upload(uploadPath, {
        folder: "melini",
        resource_type: "auto"
      });
      console.log("Cloudinary upload successful, secure url generated:", result.secure_url);
      downloadURL = result.secure_url;
    } else {
      console.log("Cloudinary configuration missing. Falling back to Firebase Storage upload...");
      let buffer;
      let contentType = "image/jpeg";
      let fileName = `upload_${Date.now()}.jpg`;

      if (isFile) {
        buffer = fs.readFileSync(req.files.file.tempFilePath);
        contentType = req.files.file.mimetype;
        fileName = `${Date.now()}_${req.files.file.name}`;
      } else {
        const base64Data = req.body.data;
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          contentType = matches[1];
          buffer = Buffer.from(matches[2], "base64");
        } else {
          buffer = Buffer.from(base64Data, "base64");
        }
      }

      const { ref: sRef, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const storageRef = sRef(storage, `uploads/${fileName}`);
      const metadata = { contentType };
      const snapshot = await uploadBytes(storageRef, buffer, metadata);
      downloadURL = await getDownloadURL(snapshot.ref);
      console.log("Firebase Storage upload successful, URL generated:", downloadURL);
    }

    res.json({ url: downloadURL });
  } catch (err) {
    console.error("Upload stream exception:", err);
    res.status(500).json({ error: "Image storage upload failed", details: err.message });
  }
});

// Delete image (Admin Protected)
router.delete("/upload", verifyAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL of image to delete is required" });

    if (url.includes("firebasestorage.googleapis.com")) {
      console.log("Initiating Firebase Storage asset deletion...");
      const { ref: sRef, deleteObject } = await import("firebase/storage");
      const decodedUrl = decodeURIComponent(url);
      const parts = decodedUrl.split("/o/");
      if (parts.length > 1) {
        const fullPath = parts[1].split("?")[0];
        const storageRef = sRef(storage, fullPath);
        await deleteObject(storageRef);
        console.log("Firebase Storage asset deleted successfully:", fullPath);
        return res.json({ success: true, message: "Firebase storage asset deleted successfully" });
      } else {
        return res.status(400).json({ error: "Invalid Firebase Storage URL format" });
      }
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(400).json({ error: "Cloudinary credentials missing; cannot delete Cloudinary asset" });
    }

    // Extract public_id from Cloudinary asset URL
    const parts = url.split("/");
    const filename = parts[parts.length - 1].split(".")[0];
    const folder = parts[parts.length - 2];
    const publicId = `${folder}/${filename}`;

    console.log("Initiating Cloudinary asset deletion for:", publicId);
    const result = await cloudinary.uploader.destroy(publicId);
    res.json({ success: true, result });
  } catch (err) {
    console.error("Delete asset exception:", err);
    res.status(500).json({ error: "Failed to delete image storage asset", details: err.message });
  }
});

export default router;
