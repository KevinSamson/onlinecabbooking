const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("../config/db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const router = express.Router();
const uploadDir = path.join(__dirname, "..", "uploads");
const allowed = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
};
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) =>
      cb(null, `${crypto.randomUUID()}${allowed[file.mimetype] || ""}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => cb(null, Boolean(allowed[file.mimetype])),
}).fields([
  { name: "identity_document", maxCount: 1 },
  { name: "licence_document", maxCount: 1 },
]);
const removeFiles = (files) =>
  Object.values(files || {})
    .flat()
    .forEach((file) => fs.unlink(file.path, () => {}));
function validContents(file) {
  const head = Buffer.alloc(8);
  const descriptor = fs.openSync(file.path, "r");
  try {
    fs.readSync(descriptor, head, 0, 8, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (file.mimetype === "application/pdf")
    return head.subarray(0, 5).toString() === "%PDF-";
  if (file.mimetype === "image/png")
    return head.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === "image/jpeg")
    return head[0] === 255 && head[1] === 216 && head[2] === 255;
  return false;
}
router.use(auth, roles("driver"));
router.get("/me", async (req, res, next) => {
  try {
    const [[row]] = await db.execute(
      "SELECT id, licence_number, status, rejection_reason, reviewed_at, created_at, updated_at FROM driver_verifications WHERE driver_id = ?",
      [req.user.id],
    );
    res.json({
      success: true,
      message: "Verification loaded.",
      data: { verification: row || null },
    });
  } catch (error) {
    next(error);
  }
});
router.post(
  "/",
  (req, res, next) =>
    upload(req, res, (error) => (error ? next(error) : next())),
  async (req, res, next) => {
    try {
      const identity = req.files?.identity_document?.[0];
      const licence = req.files?.licence_document?.[0];
      const number = String(req.body.licence_number || "").trim();
      if (
        !identity ||
        !licence ||
        number.length < 4 ||
        number.length > 80 ||
        !validContents(identity) ||
        !validContents(licence)
      ) {
        removeFiles(req.files);
        return res.status(400).json({
          success: false,
          message:
            "Upload valid JPG, PNG or PDF documents and enter a licence number.",
        });
      }
      const [[previous]] = await db.execute(
        "SELECT status, identity_document_path, licence_document_path FROM driver_verifications WHERE driver_id = ?",
        [req.user.id],
      );
      if (previous?.status === "approved") {
        removeFiles(req.files);
        return res.status(409).json({
          success: false,
          message: "Your identity is already approved.",
        });
      }
      await db.execute(
        `INSERT INTO driver_verifications (driver_id, identity_document_path, licence_document_path, licence_number)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        identity_document_path = VALUES(identity_document_path),
        licence_document_path = VALUES(licence_document_path),
        licence_number = VALUES(licence_number),
        status = 'pending', rejection_reason = NULL,
        reviewed_by = NULL, reviewed_at = NULL`,
        [req.user.id, identity.filename, licence.filename, number],
      );
      if (previous)
        [
          previous.identity_document_path,
          previous.licence_document_path,
        ].forEach((name) => fs.unlink(path.join(uploadDir, name), () => {}));
      res.status(201).json({
        success: true,
        message: "Documents submitted for review.",
        data: { status: "pending" },
      });
    } catch (error) {
      removeFiles(req.files);
      next(error);
    }
  },
);
module.exports = router;
