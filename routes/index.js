const express = require("express");
const router = express.Router();
router.get("/health", (req, res) =>
  res.json({
    success: true,
    message: "API is running.",
    data: { status: "ok" },
  }),
);
router.use("/auth", require("./auth"));
router.use("/verification", require("./verification"));
router.use("/admin", require("./admin"));
router.use("/emergency-contacts", require("./emergency"));
router.use("/driver", require("./driver"));
router.use("/rides", require("./rides"));
router.use("/", require("./safety"));
module.exports = router;
