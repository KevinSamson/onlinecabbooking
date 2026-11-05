require("dotenv").config();
const express = require("express");
const path = require("path");
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/api", require("./routes"));
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res) =>
  res.status(404).json({ success: false, message: "Resource not found." }),
);
app.use((error, req, res, next) => {
  console.error(error);
  if (error.code === "LIMIT_FILE_SIZE")
    return res
      .status(413)
      .json({ success: false, message: "Each file must be 5 MB or smaller." });
  if (error instanceof SyntaxError && "body" in error)
    return res.status(400).json({ success: false, message: "Invalid JSON." });
  res
    .status(500)
    .json({ success: false, message: "An unexpected error occurred." });
});
if (require.main === module)
  app.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        `Cab booking app: http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3000}`,
      ),
  );
module.exports = app;
