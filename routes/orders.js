import express from "express";
import { db } from "../firebase.js";
import { ref, get, set, push, update, remove } from "firebase/database";
import { objToArray, orderToClient } from "../utils/helpers.js";
import { verifyAdmin } from "../middleware/auth.js";

const router = express.Router();

// Get all orders (Admin Protected)
router.get("/admin/orders", verifyAdmin, async (req, res) => {
  try {
    const snapshot = await get(ref(db, "orders"));
    const list = objToArray(snapshot.val());
    const items = list.map(order => orderToClient(order));
    res.json({ items });
  } catch (err) {
    console.error("Admin fetch orders failed:", err);
    res.status(500).json({ error: "Failed to fetch system orders" });
  }
});

// Get single order detail with item listings (Admin Protected)
router.get("/admin/orders/:id", verifyAdmin, async (req, res) => {
  try {
    const snapshot = await get(ref(db, `orders/${req.params.id}`));
    if (!snapshot.exists()) return res.status(404).json({ error: "Order record not found" });
    res.json({ id: req.params.id, ...orderToClient(snapshot.val()) });
  } catch (err) {
    console.error("Admin fetch single order failed:", err);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
});

// Update order properties (Admin Protected)
router.put("/admin/orders/:id", verifyAdmin, async (req, res) => {
  try {
    const { id, _id, ...body } = req.body;
    body.updatedAt = Date.now();

    const orderRef = ref(db, `orders/${req.params.id}`);
    const snapshot = await get(orderRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Order not found" });

    await update(orderRef, body);
    const freshSnapshot = await get(orderRef);
    res.json({ id: req.params.id, ...orderToClient(freshSnapshot.val()) });
  } catch (err) {
    console.error("Admin update order failed:", err);
    res.status(500).json({ error: "Failed to update order details", details: err.message });
  }
});

// Patch order status, i.e. processing, shipped, delivered (Admin Protected)
router.patch("/admin/orders/:id", verifyAdmin, async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: Date.now() };
    const orderRef = ref(db, `orders/${req.params.id}`);
    const snapshot = await get(orderRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Order not found" });

    await update(orderRef, updateData);
    const freshSnapshot = await get(orderRef);
    res.json({ id: req.params.id, ...orderToClient(freshSnapshot.val()) });
  } catch (err) {
    console.error("Admin patch order failed:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// Delete order record (Admin Protected)
router.delete("/admin/orders/:id", verifyAdmin, async (req, res) => {
  try {
    const orderRef = ref(db, `orders/${req.params.id}`);
    const snapshot = await get(orderRef);
    if (!snapshot.exists()) return res.status(404).json({ error: "Order not found" });

    await remove(orderRef);
    res.json({ success: true, message: "Order record deleted from system" });
  } catch (err) {
    console.error("Delete order failed:", err);
    res.status(500).json({ error: "Failed to delete order record" });
  }
});

// Create a new checkout Order (Public) - Decrements coupon usage counts if coupon applied
router.post("/orders", async (req, res) => {
  try {
    const body = { ...req.body, createdAt: Date.now(), updatedAt: Date.now() };
    const newRef = push(ref(db, "orders"));
    await set(newRef, body);
    
    // Increment coupon usedCount if valid coupon was applied
    if (req.body.coupon) {
      const couponRef = ref(db, `coupons/${req.body.coupon}`);
      const couponSnap = await get(couponRef);
      if (couponSnap.exists()) {
        const currentCount = couponSnap.val().usedCount || 0;
        await update(couponRef, { usedCount: currentCount + 1 });
      }
    }
    
    console.log("Order successfully created & processed:", newRef.key);
    res.status(201).json({ id: newRef.key, ...orderToClient(body) });
  } catch (err) {
    console.error("Public order creation failed:", err);
    res.status(500).json({ error: "Failed to process order checkout details", details: err.message });
  }
});

export default router;
