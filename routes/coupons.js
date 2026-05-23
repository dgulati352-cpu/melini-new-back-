import express from "express";
import { db } from "../firebase.js";
import { ref, get, set, push, update, remove, query, orderByChild, equalTo } from "firebase/database";
import { objToArray } from "../utils/helpers.js";
import { verifyAdmin } from "../middleware/auth.js";

const router = express.Router();

// Get all coupons (Admin Protected)
router.get("/admin/coupons", verifyAdmin, async (req, res) => {
  try {
    const snapshot = await get(ref(db, "coupons"));
    res.json({ items: objToArray(snapshot.val()) });
  } catch (err) {
    console.error("Fetch coupons failed:", err);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// Create a promo code / coupon (Admin Protected)
router.post("/admin/coupons", verifyAdmin, async (req, res) => {
  try {
    const { id, _id, ...body } = req.body;
    
    // Normalise coupon code uppercase
    if (body.code) body.code = body.code.toUpperCase().trim();

    // Check duplicate code
    const couponsRef = query(ref(db, "coupons"), orderByChild("code"), equalTo(body.code));
    const existing = await get(couponsRef);
    if (existing.exists()) {
      return res.status(400).json({ error: `Coupon code '${body.code}' already exists` });
    }

    body.createdAt = Date.now();
    body.updatedAt = Date.now();

    const newRef = push(ref(db, "coupons"));
    await set(newRef, body);

    console.log("Coupon promo code successfully created:", body.code);
    res.status(201).json({ id: newRef.key, ...body });
  } catch (err) {
    console.error("Create coupon failed:", err);
    res.status(500).json({ error: "Failed to create coupon code", details: err.message });
  }
});

// Get coupon details (Admin Protected)
router.get("/admin/coupons/:id", verifyAdmin, async (req, res) => {
  try {
    const snapshot = await get(ref(db, `coupons/${req.params.id}`));
    if (!snapshot.exists()) return res.status(404).json({ error: "Coupon not found" });
    res.json({ id: req.params.id, ...snapshot.val() });
  } catch (err) {
    console.error("Fetch coupon details failed:", err);
    res.status(500).json({ error: "Failed to retrieve coupon details" });
  }
});

// Update coupon details (Admin Protected)
router.put("/admin/coupons/:id", verifyAdmin, async (req, res) => {
  try {
    const { id, _id, ...body } = req.body;
    if (body.code) body.code = body.code.toUpperCase().trim();
    body.updatedAt = Date.now();

    const couponRef = ref(db, `coupons/${req.params.id}`);
    const snapshot = await get(couponRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Coupon not found" });

    await update(couponRef, body);
    const freshSnapshot = await get(couponRef);
    res.json({ id: req.params.id, ...freshSnapshot.val() });
  } catch (err) {
    console.error("Update coupon failed:", err);
    res.status(500).json({ error: "Failed to update coupon details", details: err.message });
  }
});

// Patch coupon status/properties (Admin Protected)
router.patch("/admin/coupons/:id", verifyAdmin, async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: Date.now() };
    if (updateData.code) updateData.code = updateData.code.toUpperCase().trim();

    const couponRef = ref(db, `coupons/${req.params.id}`);
    const snapshot = await get(couponRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Coupon not found" });

    await update(couponRef, updateData);
    const freshSnapshot = await get(couponRef);
    res.json({ id: req.params.id, ...freshSnapshot.val() });
  } catch (err) {
    console.error("Patch coupon failed:", err);
    res.status(500).json({ error: "Failed to update coupon" });
  }
});

// Delete coupon (Admin Protected)
router.delete("/admin/coupons/:id", verifyAdmin, async (req, res) => {
  try {
    const couponRef = ref(db, `coupons/${req.params.id}`);
    const snapshot = await get(couponRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Coupon not found" });

    await remove(couponRef);
    res.json({ success: true, message: "Coupon deleted successfully" });
  } catch (err) {
    console.error("Delete coupon failed:", err);
    res.status(500).json({ error: "Failed to delete coupon" });
  }
});

// Public Validation of promo code at checkout (Public)
router.post("/coupons/validate", async (req, res) => {
  const { code, orderAmount } = req.body;
  if (!code) return res.status(400).json({ error: "Promo code is required" });

  try {
    const couponsRef = query(ref(db, "coupons"), orderByChild("code"), equalTo(code.toUpperCase().trim()));
    const snapshot = await get(couponsRef);

    if (!snapshot.exists())
      return res.status(404).json({ error: "Invalid promo code" });
      
    const val = snapshot.val();
    const id = Object.keys(val)[0];
    const coupon = val[id];

    if (!coupon.isActive)
      return res.status(400).json({ error: "This promo code is no longer active" });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())
      return res.status(400).json({ error: "This promo code has expired" });
    if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit)
      return res.status(400).json({ error: "This promo code has reached its usage limit" });
    if (coupon.minOrderAmount && orderAmount < coupon.minOrderAmount)
      return res.status(400).json({
        error: `Minimum order amount of ₹${coupon.minOrderAmount} required for this promo code`,
      });

    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = Math.round((orderAmount * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount)
        discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
    } else {
      discountAmount = Math.min(coupon.discountValue, orderAmount);
    }

    res.json({
      valid: true,
      discountAmount,
      couponId: id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
    });
  } catch (err) {
    console.error("Validate coupon error:", err);
    res.status(500).json({ error: "Server failed to validate promo code" });
  }
});

export default router;
