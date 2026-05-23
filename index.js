import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fileUpload from "express-fileupload";

// Import modular routes
import authRouter from "./routes/auth.js";
import productsRouter from "./routes/products.js";
import couponsRouter from "./routes/coupons.js";
import ordersRouter from "./routes/orders.js";
import settingsRouter from "./routes/settings.js";
import paymentsRouter from "./routes/payments.js";
import reviewsRouter from "./routes/reviews.js";
import uploadRouter from "./routes/upload.js";

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

// Express File Upload configuration — keep in memory (no temp files on Vercel)
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
}));

// Mount modular routers onto the main /api router
router.use("/", authRouter);
router.use("/", productsRouter);
router.use("/", couponsRouter);
router.use("/", ordersRouter);
router.use("/", settingsRouter);
router.use("/", paymentsRouter);
router.use("/", reviewsRouter);
router.use("/", uploadRouter);

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