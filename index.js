import express from "express";
import Razorpay from "razorpay";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import jwt from "jsonwebtoken";
import fileUpload from "express-fileupload";

dotenv.config();

const app = express();
const router = express.Router();

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

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
  tempFileDir: '/tmp/'
}));

/* ---------------- CLOUDINARY CONFIG ---------------- */
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/* ---------------- DATABASE SCHEMAS ---------------- */

// 1. PRODUCT (ARTICLE) SCHEMA
const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
    price: { type: Number, required: true },
    originalPrice: Number,
    description: String,
    shortDescription: String,
    images: [String],
    category: { type: String, default: "summer" },
    sizes: [String],
    colors: [{
      name: String,
      value: String,
      images: [String]
    }],
    inStock: { type: Boolean, default: true },
    isBestSeller: { type: Boolean, default: false },
    isNewProduct: { type: Boolean, default: false },
    material: String,
    careInstructions: [String],
    features: [String],
    articleNo: { type: String, sparse: true }, // The unique SKU/Article number requested by the user
    sizePricing: [{ size: String, price: Number, originalPrice: Number }],
    metaTitle: String,
    metaDescription: String,
    tags: [String],
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", ProductSchema);

// 2. COUPON (PROMO CODE) SCHEMA
const CouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },
    discountValue: { type: Number, required: true },
    minOrderAmount: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number },
    usageLimit: { type: Number },
    usedCount: { type: Number, default: 0 },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Coupon = mongoose.model("Coupon", CouponSchema);

// 3. ORDER SCHEMA
const OrderSchema = new mongoose.Schema(
  {
    user: { type: String }, // User identifier
    orderItems: [
      {
        name: { type: String, required: true },
        qty: { type: Number, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
        product: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: "Product",
        },
        size: String,
        color: { name: String, value: String },
      },
    ],
    shippingAddress: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true, default: "India" },
    },
    paymentMethod: { type: String, required: true, default: "Razorpay" },
    paymentResult: {
      id: { type: String },
      status: { type: String },
      update_time: { type: String },
      email_address: { type: String },
    },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
    },
    itemsPrice: { type: Number, required: true, default: 0.0 },
    taxPrice: { type: Number, required: true, default: 0.0 },
    shippingPrice: { type: Number, required: true, default: 0.0 },
    discountAmount: { type: Number, required: true, default: 0.0 },
    totalPrice: { type: Number, required: true, default: 0.0 },
    isPaid: { type: Boolean, required: true, default: false },
    paidAt: { type: Date },
    isDelivered: { type: Boolean, required: true, default: false },
    deliveredAt: { type: Date },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
    orderNotes: String,
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", OrderSchema);

// 4. REVIEW SCHEMA
const ReviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Product",
    },
    user: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    images: [String],
    isApproved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Review = mongoose.model("Review", ReviewSchema);

// 5. SITE CONFIG SCHEMA (Site customisations & settings)
const SiteConfigSchema = new mongoose.Schema(
  {
    heroTitle: { type: String, default: "Elegance in Every Stitch" },
    heroSubtitle: { type: String, default: "Discover premium comfort wear that blends traditional craftsmanship with modern elegance." },
    heroBadge: { type: String, default: "New Collection 2025" },
    announcement: { type: String, default: "Free shipping on orders above ₹999" },
    promoBannerUrl: String,
    promoLink: String,
    storeName: { type: String, default: "MELINI" },
    tagline: { type: String, default: "Timeless Indian Clothing" },
    contactEmail: String,
    whatsapp: { type: String, default: "919870758284" },
    instagram: String,
    freeShippingThreshold: { type: Number, default: 999 },
    currency: { type: String, default: "INR" },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const SiteConfig = mongoose.model("SiteConfig", SiteConfigSchema);

/* ---------------- HELPERS & MIDDLEWARES ---------------- */

// Helper to normalise regular database documents
const toClient = (doc) => {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : doc;
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

// Specialized helper for mapping orders (crucial since the frontend checks order.items but database saves orderItems)
const orderToClient = (doc) => {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : doc;
  obj.id = obj._id.toString();
  
  // critical frontend compatibility fix: mapping 'orderItems' into 'items'
  if (obj.orderItems) {
    obj.items = obj.orderItems.map(item => ({
      product: item.product ? item.product.toString() : "",
      name: item.name,
      qty: item.qty,
      image: item.image,
      price: item.price,
      size: item.size,
      color: item.color?.name || (typeof item.color === 'string' ? item.color : undefined)
    }));
  } else {
    obj.items = [];
  }
  
  delete obj._id;
  delete obj.__v;
  return obj;
};

// JWT Validation middleware for admin protected routes
const verifyAdmin = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    console.warn("Auth warning: Missing or malformed Authorization header");
    return res.status(401).json({ error: "Unauthorized access: Bearer token required" });
  }

  const token = auth.slice(7);

  if (!process.env.JWT_SECRET) {
    console.error("Critical System Config Error: JWT_SECRET is not defined!");
    return res.status(500).json({ error: "Server configurations missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
    const items = await Product.find().sort({ createdAt: -1 });
    res.json({ items: items.map(toClient) });
  } catch (err) {
    console.error("Fetch products failed:", err);
    res.status(500).json({ error: "Failed to retrieve products catalog", details: err.message });
  }
});

// Get single product details by slug (Public)
router.get("/products/:slug", async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(toClient(product));
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

    const product = await Product.create(body);
    console.log("New article successfully created:", product.articleNo || product.name);
    res.status(201).json(toClient(product));
  } catch (err) {
    console.error("Create product failed:", err);
    res.status(500).json({ error: "Failed to create product article", details: err.message });
  }
});

// Update product article details (Admin Protected)
router.put("/admin/products/:id", verifyAdmin, async (req, res) => {
  try {
    const { id, _id, ...body } = req.body;
    
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ error: "Product not found in catalog" });
    
    console.log("Product article updated successfully:", product.articleNo || product.name);
    res.json(toClient(product));
  } catch (err) {
    console.error("Update product failed:", err);
    res.status(500).json({ error: "Failed to update product article details", details: err.message });
  }
});

// Delete product article (Admin Protected)
router.delete("/admin/products/:id", verifyAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
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
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ items: coupons.map(toClient) });
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
    const existing = await Coupon.findOne({ code: body.code });
    if (existing) {
      return res.status(400).json({ error: `Coupon code '${body.code}' already exists` });
    }

    const coupon = await Coupon.create(body);
    console.log("Coupon promo code successfully created:", coupon.code);
    res.status(201).json(toClient(coupon));
  } catch (err) {
    console.error("Create coupon failed:", err);
    res.status(500).json({ error: "Failed to create coupon code", details: err.message });
  }
});

// Get coupon details (Admin Protected)
router.get("/admin/coupons/:id", verifyAdmin, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });
    res.json(toClient(coupon));
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

    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    );
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });
    res.json(toClient(coupon));
  } catch (err) {
    console.error("Update coupon failed:", err);
    res.status(500).json({ error: "Failed to update coupon details", details: err.message });
  }
});

// Patch coupon status/properties (Admin Protected)
router.patch("/admin/coupons/:id", verifyAdmin, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });
    res.json(toClient(coupon));
  } catch (err) {
    console.error("Patch coupon failed:", err);
    res.status(500).json({ error: "Failed to update coupon" });
  }
});

// Delete coupon (Admin Protected)
router.delete("/admin/coupons/:id", verifyAdmin, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });
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
    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });

    if (!coupon)
      return res.status(404).json({ error: "Invalid promo code" });
    if (!coupon.isActive)
      return res.status(400).json({ error: "This promo code is no longer active" });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())
      return res.status(400).json({ error: "This promo code has expired" });
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit)
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
      couponId: coupon._id.toString(),
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

// Get all orders (Admin Protected) - Maps orderItems to items for frontend compliance
router.get("/admin/orders", verifyAdmin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ items: orders.map(orderToClient) });
  } catch (err) {
    console.error("Admin fetch orders failed:", err);
    res.status(500).json({ error: "Failed to fetch system orders" });
  }
});

// Get single order detail with item listings (Admin Protected)
router.get("/admin/orders/:id", verifyAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order record not found" });
    res.json(orderToClient(order));
  } catch (err) {
    console.error("Admin fetch single order failed:", err);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
});

// Update order properties (Admin Protected)
router.put("/admin/orders/:id", verifyAdmin, async (req, res) => {
  try {
    const { id, _id, ...body } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    );
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(orderToClient(order));
  } catch (err) {
    console.error("Admin update order failed:", err);
    res.status(500).json({ error: "Failed to update order details", details: err.message });
  }
});

// Patch order status, i.e. processing, shipped, delivered (Admin Protected)
router.patch("/admin/orders/:id", verifyAdmin, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(orderToClient(order));
  } catch (err) {
    console.error("Admin patch order failed:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// Delete order record (Admin Protected)
router.delete("/admin/orders/:id", verifyAdmin, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true, message: "Order record deleted from system" });
  } catch (err) {
    console.error("Delete order failed:", err);
    res.status(500).json({ error: "Failed to delete order record" });
  }
});

// Create a new checkout Order (Public) - Decrements coupon usage counts if coupon applied
router.post("/orders", async (req, res) => {
  try {
    const order = await Order.create(req.body);
    
    // Increment coupon usedCount if valid coupon was applied
    if (req.body.coupon) {
      await Coupon.findByIdAndUpdate(req.body.coupon, { $inc: { usedCount: 1 } });
    }
    
    console.log("Order successfully created & processed:", order._id.toString());
    res.status(201).json(orderToClient(order));
  } catch (err) {
    console.error("Public order creation failed:", err);
    res.status(500).json({ error: "Failed to process order checkout details", details: err.message });
  }
});

/* ---------------- CONFIGURATION & SETTINGS ENDPOINTS ---------------- */

// Retrieve general site configuration (Public)
router.get("/site-config", async (req, res) => {
  try {
    let siteConfig = await SiteConfig.findOne();
    if (!siteConfig) {
      siteConfig = await SiteConfig.create({}); // Default fallback creation
    }
    res.json(toClient(siteConfig));
  } catch (err) {
    console.error("Fetch site config failed:", err);
    res.status(500).json({ error: "Failed to load site configurations" });
  }
});

// Retrieve site configuration (Admin Protected)
router.get("/admin/site-config", verifyAdmin, async (req, res) => {
  try {
    let siteConfig = await SiteConfig.findOne();
    if (!siteConfig) {
      siteConfig = await SiteConfig.create({});
    }
    res.json(toClient(siteConfig));
  } catch (err) {
    console.error("Admin fetch site config failed:", err);
    res.status(500).json({ error: "Failed to fetch admin site configurations" });
  }
});

// Update site configurations (Admin Protected)
router.put("/admin/site-config", verifyAdmin, async (req, res) => {
  try {
    const { id, _id, ...body } = req.body;
    let siteConfig = await SiteConfig.findOne();
    
    if (!siteConfig) {
      siteConfig = await SiteConfig.create(body);
    } else {
      siteConfig = await SiteConfig.findByIdAndUpdate(
        siteConfig._id,
        body,
        { new: true, runValidators: true }
      );
    }
    res.json(toClient(siteConfig));
  } catch (err) {
    console.error("Admin update site config failed:", err);
    res.status(500).json({ error: "Failed to save site configurations", details: err.message });
  }
});

// Get admin settings mapped from unified site config (Admin Protected)
router.get("/admin/settings", verifyAdmin, async (req, res) => {
  try {
    let siteConfig = await SiteConfig.findOne();
    if (!siteConfig) {
      siteConfig = await SiteConfig.create({});
    }
    // Mapped precisely to what SettingsTab expects
    const settings = {
      storeName: siteConfig.storeName,
      tagline: siteConfig.tagline,
      contactEmail: siteConfig.contactEmail,
      whatsapp: siteConfig.whatsapp,
      instagram: siteConfig.instagram,
      announcementBar: siteConfig.announcement,
      freeShippingThreshold: siteConfig.freeShippingThreshold,
      currency: siteConfig.currency,
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
    let siteConfig = await SiteConfig.findOne();
    const updateData = { ...req.body };
    if (updateData.announcementBar) {
      updateData.announcement = updateData.announcementBar;
    }

    if (!siteConfig) {
      siteConfig = await SiteConfig.create(updateData);
    } else {
      siteConfig = await SiteConfig.findByIdAndUpdate(siteConfig._id, updateData, { new: true });
    }
    res.json(toClient(siteConfig));
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
    const razorpayKey = process.env.RAZORPAY_KEY_ID;
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKey || !razorpaySecret) {
      console.error("Razorpay Keys missing inside server environments!");
      return res.status(500).json({ error: "Payment gateway configuration is missing" });
    }

    const razorpay = new Razorpay({
      key_id: razorpayKey,
      key_secret: razorpaySecret,
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
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json({ items: reviews.map(toClient) });
  } catch (err) {
    console.error("Admin fetch reviews failed:", err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// Patch review approval status (Admin Protected)
router.patch("/admin/reviews/:id", verifyAdmin, async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!review) return res.status(404).json({ error: "Review not found" });
    res.json(toClient(review));
  } catch (err) {
    console.error("Admin patch review failed:", err);
    res.status(500).json({ error: "Failed to update review approval status" });
  }
});

// Delete review (Admin Protected)
router.delete("/admin/reviews/:id", verifyAdmin, async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ error: "Review not found" });
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
  res.send("MELINI Professional Node.js Backend is Running Successfully 🚀");
});

app.use("/api", router);

/* ---------------- SERVER & DATABASE CONNECTION ---------------- */

async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI configuration is missing inside server environments!");
  }
  await mongoose.connect(MONGODB_URI);
  console.log("Mongoose Database connected successfully 🔌");
}

// Start local server if not running in a Serverless (e.g., Vercel) environment
if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`MELINI Server active and listening on Port ${PORT} ⚡`);
    try {
      await connectDB();
    } catch (err) {
      console.error("Database connection exception occurred on boot:", err.message);
    }
  });
}

export { connectDB };
export default app;
