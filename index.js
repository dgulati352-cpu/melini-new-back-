import express from "express";
import Razorpay from "razorpay";
import cors from "cors";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import jwt from "jsonwebtoken";
import fileUpload from "express-fileupload";
import os from "os";

// Import initialized Firebase client SDK database instance
import { db } from "./firebase.js";
import { ref, get, set, push, update, remove, query, orderByChild, equalTo } from "firebase/database";

dotenv.config();

const app = express();
const router = express.Router();

const PORT = process.env.PORT || 5000;

// CORS setup supporting wildcard and credentials
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Express File Upload configuration for Cloudinary uploads
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: os.tmpdir()
}));

/* ---------------- CLOUDINARY CONFIG ---------------- */
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/* ---------------- DATA NORMALIZERS ---------------- */

// Helper to convert Firebase Database Objects to Client Arrays
const objToArray = (obj) => {
  if (!obj) return [];
  return Object.keys(obj)
    .map(key => ({ id: key, ...obj[key] }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

// Map order document properties to ensure frontend compatability with 'items' instead of 'orderItems'
const orderToClient = (order) => {
  if (!order) return order;
  
  if (order.orderItems) {
    order.items = order.orderItems.map(item => ({
      product: item.product || "",
      name: item.name,
      qty: item.qty,
      image: item.image,
      price: item.price,
      size: item.size,
      color: item.color?.name || (typeof item.color === 'string' ? item.color : undefined)
    }));
  } else {
    order.items = [];
  }
  return order;
};

/* ---------------- HELPERS & MIDDLEWARES ---------------- */

// JWT Validation middleware for admin protected routes
const verifyAdmin = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    console.warn("Auth warning: Missing or malformed Authorization header");
    return res.status(401).json({ error: "Unauthorized access: Bearer token required" });
  }

  const token = auth.slice(7);
  const jwtSecret = process.env.JWT_SECRET || "melini_secret_key_2026";

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.admin = decoded;
    next();
  } catch (err) {
    console.warn("Auth warning: Invalid or expired token presented", { message: err.message });
    return res.status(401).json({ error: "Session expired or invalid token" });
  }
};

/* ---------------- ADMIN AUTHENTICATION ---------------- */

router.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "melini123";
  const jwtSecret = process.env.JWT_SECRET || "melini_secret_key_2026";

  if (username !== adminUser || password !== adminPass) {
    return res.status(401).json({ error: "Invalid username or password credentials" });
  }

  const token = jwt.sign({ role: "admin" }, jwtSecret, {
    expiresIn: "8h",
  });

  res.json({ token });
});

/* ---------------- PRODUCT / ARTICLE ENDPOINTS ---------------- */

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

/* ---------------- PROMO CODE / COUPON ENDPOINTS ---------------- */

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

/* ---------------- ORDER MANAGEMENT ENDPOINTS ---------------- */

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

/* ---------------- CONFIGURATION & SETTINGS ENDPOINTS ---------------- */

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

/* ---------------- RAZORPAY PAYMENT ENDPOINT ---------------- */

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

/* ---------------- REVIEWS ENDPOINTS ---------------- */

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

/* ---------------- IMAGE CLOUDINARY UPLOAD ENDPOINTS ---------------- */

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

/* ---------------- ROOT & GENERAL CHECKS ---------------- */

app.get("/", (_req, res) => {
  res.send("MELINI Professional Firebase RTDB Backend is Running Successfully 🚀");
});

app.use("/api", router);

// Dummy connection function for compatibility with api/[...path].ts handler
const connectDB = () => Promise.resolve();

// Start local server if not running in Vercel serverless environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`MELINI Firebase Server active and listening on Port ${PORT} ⚡`);
  });
}

export { connectDB };
export default app;
