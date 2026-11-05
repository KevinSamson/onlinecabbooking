const express = require("express");
const db = require("../config/db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const router = express.Router();
router.use(auth, roles("passenger"));
const fields = (body) => ({
  name: String(body.name || "").trim(),
  phone: String(body.phone || "").trim(),
  relationship: String(body.relationship || "").trim(),
});
const valid = (value) =>
  value.name.length >= 2 &&
  value.name.length <= 120 &&
  /^\+?[0-9 ()-]{7,30}$/.test(value.phone) &&
  value.relationship.length >= 2 &&
  value.relationship.length <= 80;

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      "SELECT id, name, phone, relationship, created_at, updated_at FROM emergency_contacts WHERE passenger_id = ? ORDER BY created_at DESC",
      [req.user.id],
    );
    res.json({
      success: true,
      message: "Contacts loaded.",
      data: { items: rows },
    });
  } catch (error) {
    next(error);
  }
});
router.post("/", async (req, res, next) => {
  try {
    const value = fields(req.body);
    if (!valid(value))
      return res.status(400).json({
        success: false,
        message: "Enter a valid name, phone and relationship.",
      });
    const [result] = await db.execute(
      "INSERT INTO emergency_contacts (passenger_id, name, phone, relationship) VALUES (?, ?, ?, ?)",
      [req.user.id, value.name, value.phone, value.relationship],
    );
    res.status(201).json({
      success: true,
      message: "Contact added.",
      data: { id: result.insertId, ...value },
    });
  } catch (error) {
    next(error);
  }
});
router.put("/:id", async (req, res, next) => {
  try {
    const value = fields(req.body);
    if (!valid(value))
      return res.status(400).json({
        success: false,
        message: "Enter a valid name, phone and relationship.",
      });
    const [result] = await db.execute(
      "UPDATE emergency_contacts SET name = ?, phone = ?, relationship = ? WHERE id = ? AND passenger_id = ?",
      [value.name, value.phone, value.relationship, req.params.id, req.user.id],
    );
    if (!result.affectedRows)
      return res
        .status(404)
        .json({ success: false, message: "Contact not found." });
    res.json({
      success: true,
      message: "Contact updated.",
      data: { id: Number(req.params.id), ...value },
    });
  } catch (error) {
    next(error);
  }
});
router.delete("/:id", async (req, res, next) => {
  try {
    const [result] = await db.execute(
      "DELETE FROM emergency_contacts WHERE id = ? AND passenger_id = ?",
      [req.params.id, req.user.id],
    );
    if (!result.affectedRows)
      return res
        .status(404)
        .json({ success: false, message: "Contact not found." });
    res.json({ success: true, message: "Contact deleted.", data: {} });
  } catch (error) {
    next(error);
  }
});
module.exports = router;
