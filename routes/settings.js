import express from "express";
import { db } from "../firebase.js";
import { ref, get, set, update } from "firebase/database";
import { verifyAdmin } from "../middleware/auth.js";

const router = express.Router();

// Retrieve general site configuration (Public)
router.get("/site-config", async (req, res) => {
  try {
    const configRef = ref(db, "siteConfig");
    const snapshot = await get(configRef);
    if (!snapshot.exists()) {
      const defaults = {
        heroTitle: "Elegance in Every Stitch",
        heroSubtitle: "Discover premium comfort wear that blends traditional craftsmanship with modern elegance.",
        heroBadge: "New Collection 2025",
        announcement: "Free shipping on orders above ₹999",
        storeName: "MELINI",
        tagline: "Timeless Indian Clothing",
        whatsapp: "919870758284",
        freeShippingThreshold: 999,
        currency: "INR",
        maintenanceMode: false
      };
      await set(configRef, defaults);
      return res.json(defaults);
    }
    const configData = { ...snapshot.val() };
    delete configData.razorpayKeySecret; // Hide payment secrets from public
    res.json(configData);
  } catch (err) {
    console.error("Fetch site config failed:", err);
    res.status(500).json({ error: "Failed to load site configurations" });
  }
});

// Retrieve site configuration (Admin Protected)
router.get("/admin/site-config", verifyAdmin, async (req, res) => {
  try {
    const configRef = ref(db, "siteConfig");
    const snapshot = await get(configRef);
    if (!snapshot.exists()) {
      const defaults = { storeName: "MELINI" };
      await set(configRef, defaults);
      return res.json(defaults);
    }
    res.json(snapshot.val());
  } catch (err) {
    console.error("Admin fetch site config failed:", err);
    res.status(500).json({ error: "Failed to fetch admin site configurations" });
  }
});

// Update site configurations (Admin Protected)
router.put("/admin/site-config", verifyAdmin, async (req, res) => {
  try {
    const { id, _id, ...body } = req.body;
    const configRef = ref(db, "siteConfig");
    await update(configRef, body);
    
    const freshSnapshot = await get(configRef);
    res.json(freshSnapshot.val());
  } catch (err) {
    console.error("Admin update site config failed:", err);
    res.status(500).json({ error: "Failed to save site configurations", details: err.message });
  }
});

// Get admin settings mapped from unified site config (Admin Protected)
router.get("/admin/settings", verifyAdmin, async (req, res) => {
  try {
    const snapshot = await get(ref(db, "siteConfig"));
    let siteConfig = snapshot.val() || {};
    
    const settings = {
      storeName: siteConfig.storeName || "MELINI",
      tagline: siteConfig.tagline || "Timeless Indian Clothing",
      contactEmail: siteConfig.contactEmail || "",
      whatsapp: siteConfig.whatsapp || "919870758284",
      instagram: siteConfig.instagram || "",
      announcementBar: siteConfig.announcement || siteConfig.announcementBar || "Free shipping on orders above ₹999",
      freeShippingThreshold: siteConfig.freeShippingThreshold || 999,
      currency: siteConfig.currency || "INR",
      razorpayKeyId: siteConfig.razorpayKeyId || "",
      razorpayKeySecret: siteConfig.razorpayKeySecret || ""
    };
    res.json(settings);
  } catch (err) {
    console.error("Admin fetch settings failed:", err);
    res.status(500).json({ error: "Failed to load admin settings tab" });
  }
});

// Update admin settings (Admin Protected)
router.put("/admin/settings", verifyAdmin, async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.announcementBar) {
      updateData.announcement = updateData.announcementBar;
    }

    const configRef = ref(db, "siteConfig");
    await update(configRef, updateData);

    const freshSnapshot = await get(configRef);
    res.json(freshSnapshot.val());
  } catch (err) {
    console.error("Admin update settings failed:", err);
    res.status(500).json({ error: "Failed to update admin settings" });
  }
});

export default router;
