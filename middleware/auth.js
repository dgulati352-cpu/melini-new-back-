import jwt from "jsonwebtoken";

export const verifyAdmin = (req, res, next) => {
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
