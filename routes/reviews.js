import express from "express";
import { db } from "../firebase.js";
import { ref, get, update, remove } from "firebase/database";
import { objToArray } from "../utils/helpers.js";
import { verifyAdmin } from "../middleware/auth.js";

const router = express.Router();

// Get all reviews (Admin Protected)
router.get("/admin/reviews", verifyAdmin, async (req, res) => {
  try {
    const snapshot = await get(ref(db, "reviews"));
    res.json({ items: objToArray(snapshot.val()) });
  } catch (err) {
    console.error("Admin fetch reviews failed:", err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// Get single review (Admin Protected)
router.get("/admin/reviews/:id", verifyAdmin, async (req, res) => {
  try {
    const snapshot = await get(ref(db, `reviews/${req.params.id}`));
    if (!snapshot.exists()) return res.status(404).json({ error: "Review not found" });
    res.json({ id: req.params.id, ...snapshot.val() });
  } catch (err) {
    console.error("Admin fetch review details failed:", err);
    res.status(500).json({ error: "Failed to fetch review record" });
  }
});

// Update review (Admin Protected)
router.put("/admin/reviews/:id", verifyAdmin, async (req, res) => {
  try {
    const { id, _id, ...body } = req.body;
    body.updatedAt = Date.now();

    const reviewRef = ref(db, `reviews/${req.params.id}`);
    const snapshot = await get(reviewRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Review not found" });

    await update(reviewRef, body);
    const freshSnapshot = await get(reviewRef);
    res.json({ id: req.params.id, ...freshSnapshot.val() });
  } catch (err) {
    console.error("Admin update review failed:", err);
    res.status(500).json({ error: "Failed to update review record" });
  }
});

// Patch review approval status (Admin Protected)
router.patch("/admin/reviews/:id", verifyAdmin, async (req, res) => {
  try {
    const reviewRef = ref(db, `reviews/${req.params.id}`);
    const snapshot = await get(reviewRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Review not found" });

    await update(reviewRef, req.body);
    const freshSnapshot = await get(reviewRef);
    res.json({ id: req.params.id, ...freshSnapshot.val() });
  } catch (err) {
    console.error("Admin patch review failed:", err);
    res.status(500).json({ error: "Failed to update review approval status" });
  }
});

// Delete review (Admin Protected)
router.delete("/admin/reviews/:id", verifyAdmin, async (req, res) => {
  try {
    const reviewRef = ref(db, `reviews/${req.params.id}`);
    const snapshot = await get(reviewRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Review not found" });

    await remove(reviewRef);
    res.json({ success: true, message: "Review deleted successfully" });
  } catch (err) {
    console.error("Admin delete review failed:", err);
    res.status(500).json({ error: "Failed to delete review record" });
  }
});

export default router;
