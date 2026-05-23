import express from "express";
import { db } from "../firebase.js";
import { ref, get, set, push, update, remove, query, orderByChild, equalTo } from "firebase/database";
import { objToArray } from "../utils/helpers.js";
import { verifyAdmin } from "../middleware/auth.js";

const router = express.Router();

// Get all products (Public)
router.get("/products", async (req, res) => {
  try {
    const snapshot = await get(ref(db, "products"));
    res.json({ items: objToArray(snapshot.val()) });
  } catch (err) {
    console.error("Fetch products failed:", err);
    res.status(500).json({ error: "Failed to retrieve products catalog", details: err.message });
  }
});

// Get single product details by slug (Public)
router.get("/products/:slug", async (req, res) => {
  try {
    const productsRef = query(ref(db, "products"), orderByChild("slug"), equalTo(req.params.slug));
    const snapshot = await get(productsRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Product not found" });
    
    const val = snapshot.val();
    const id = Object.keys(val)[0];
    res.json({ id, ...val[id] });
  } catch (err) {
    console.error("Fetch single product failed:", err);
    res.status(500).json({ error: "Failed to fetch product details" });
  }
});

// Create a new product article (Admin Protected)
router.post("/admin/products", verifyAdmin, async (req, res) => {
  try {
    const { id, _id, ...body } = req.body;
    
    // Auto-generate slug if it doesn't exist
    if (!body.slug && body.name) {
      body.slug = body.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    }

    body.createdAt = Date.now();
    body.updatedAt = Date.now();

    const newRef = push(ref(db, "products"));
    await set(newRef, body);
    
    console.log("New article successfully created:", body.articleNo || body.name);
    res.status(201).json({ id: newRef.key, ...body });
  } catch (err) {
    console.error("Create product failed:", err);
    res.status(500).json({ error: "Failed to create product article", details: err.message });
  }
});

// Update product article details (Admin Protected)
router.put("/admin/products/:id", verifyAdmin, async (req, res) => {
  try {
    const { id, _id, ...body } = req.body;
    body.updatedAt = Date.now();

    const productRef = ref(db, `products/${req.params.id}`);
    const snapshot = await get(productRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Product not found in catalog" });

    await update(productRef, body);
    const freshSnapshot = await get(productRef);
    
    console.log("Product article updated successfully:", body.articleNo || body.name);
    res.json({ id: req.params.id, ...freshSnapshot.val() });
  } catch (err) {
    console.error("Update product failed:", err);
    res.status(500).json({ error: "Failed to update product article details", details: err.message });
  }
});

// Delete product article (Admin Protected)
router.delete("/admin/products/:id", verifyAdmin, async (req, res) => {
  try {
    const productRef = ref(db, `products/${req.params.id}`);
    const snapshot = await get(productRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Product not found" });
    
    await remove(productRef);
    res.json({ success: true, message: "Product article deleted successfully" });
  } catch (err) {
    console.error("Delete product failed:", err);
    res.status(500).json({ error: "Failed to delete product article" });
  }
});

export default router;
