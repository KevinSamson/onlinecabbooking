const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const auth = require("../middleware/auth");
const router = express.Router();
const clean = (value) => String(value || "").trim();
const publicUser = (user) => ({
  id: user.id,
  full_name: user.full_name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
});

router.post("/register", async (req, res, next) => {
  try {
    const full_name = clean(req.body.full_name);
    const email = clean(req.body.email).toLowerCase();
    const phone = clean(req.body.phone);
    const password = String(req.body.password || "");
    const role = clean(req.body.role);
    if (
      full_name.length < 2 ||
      full_name.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^\+?[0-9 ()-]{7,30}$/.test(phone) ||
      password.length < 8 ||
      !["passenger", "driver"].includes(role)
    )
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid name, email, phone, password (8+ characters), and role.",
      });
    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)",
      [full_name, email, phone, hash, role],
    );
    res.status(201).json({
      success: true,
      message: "Account created. Sign in to continue.",
      data: {
        user: {
          id: result.insertId,
          full_name,
          email,
          phone,
          role,
          status: "active",
        },
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY")
      return res.status(409).json({
        success: false,
        message: "Email or phone is already registered.",
      });
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    const [[user]] = await db.execute("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    if (user.status === "blocked")
      return res
        .status(403)
        .json({ success: false, message: "This account is blocked." });
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
      throw new Error("JWT_SECRET must be at least 32 characters");
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "12h",
    });
    res.json({
      success: true,
      message: "Welcome back.",
      data: { token, user: publicUser(user) },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", auth, (req, res) =>
  res.json({
    success: true,
    message: "Account loaded.",
    data: { user: publicUser(req.user) },
  }),
);
module.exports = router;
