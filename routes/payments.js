import express from "express";
import Razorpay from "razorpay";
import { db } from "../firebase.js";
import { ref, get } from "firebase/database";

const router = express.Router();

// Create a Razorpay Order ID for frontend checkout
router.post("/create-order", async (req, res) => {
  const { amount } = req.body;
  if (!amount) return res.status(400).json({ error: "Payment amount is required" });

  try {
    let keyId = process.env.RAZORPAY_KEY_ID;
    let keySecret = process.env.RAZORPAY_KEY_SECRET;

    // Fetch keys from database settings if not set in environment variables
    if (!keyId || !keySecret) {
      const configSnapshot = await get(ref(db, "siteConfig"));
      if (configSnapshot.exists()) {
        const siteConfig = configSnapshot.val();
        keyId = keyId || siteConfig.razorpayKeyId;
        keySecret = keySecret || siteConfig.razorpayKeySecret;
      }
    }

    // Fallback Mock order generator for testing if no Razorpay credentials configured
    if (!keyId || !keySecret) {
      console.warn("Razorpay Keys are missing on server. Simulating mock payment order creation for testing.");
      return res.json({
        id: `mock_order_${Date.now()}`,
        amount: Math.round(Number(amount) * 100),
        currency: "INR",
        receipt: `melini_${Date.now()}`,
        status: "created",
        isMock: true
      });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100), // Razorpay accepts amounts in Paisa
      currency: "INR",
      receipt: `melini_${Date.now()}`,
    });

    res.json(razorpayOrder);
  } catch (err) {
    console.error("Razorpay Order Creation failure:", err);
    res.status(500).json({ error: "Failed to initialize payment gateway transaction", details: err.message });
  }
});

export default router;
