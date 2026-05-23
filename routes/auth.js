import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

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

export default router;
