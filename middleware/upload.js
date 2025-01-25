const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const logger = require("../config/logger");

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    if (!req.body.uploadId) {
      return cb(new Error("uploadId is required"));
    }

    const chunkDir = path.join(__dirname, "../tempuploads", req.body.uploadId);

    try {
      await fs.mkdir(chunkDir, { recursive: true });

      // Store first few chunks for thumbnail generation (approximately 10MB of data)
      if (req.body.type !== "reel" && parseInt(req.body.chunkNumber) <= 5) {
        const chunks = [];
        file.stream.on("data", (chunk) => chunks.push(chunk));
        file.stream.on("end", async () => {
          const chunkBuffer = Buffer.concat(chunks);
          // Store chunk in temporary file
          const tempChunkPath = path.join(
            chunkDir,
            `thumb-${req.body.chunkNumber}`
          );
          await fs.writeFile(tempChunkPath, chunkBuffer);
        });
      }

      cb(null, chunkDir);
    } catch (error) {
      console.log("error", error);
      logger.error("Error creating chunk directory:", error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    if (!req.body.chunkNumber) {
      return cb(new Error("chunkNumber is required"));
    }
    cb(null, `chunk-${req.body.chunkNumber}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: CHUNK_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (!req.body.uploadId || !req.body.chunkNumber || !req.body.totalChunks) {
      cb(new Error("Missing required fields"));
      return;
    }

    const chunkSize = parseInt(req.headers["content-length"] || 0);
    if (chunkSize > CHUNK_SIZE) {
      console.log("chunkSize too large", chunkSize);
      logger.error(`Chunk size too large: ${chunkSize} bytes`);
      cb(new Error(`Chunk size must be less than ${CHUNK_SIZE} bytes`));
      return;
    }

    cb(null, true);
  },
}).single("chunk");

// Create a wrapper middleware
const uploadMiddleware = (req, res, next) => {
  upload(req, res, function (err) {
    if (err) {
      logger.error("Multer error:", err);
      return res.status(400).json({
        error: "Upload failed",
        details: err.message,
      });
    }
    next();
  });
};

module.exports = { uploadMiddleware };
