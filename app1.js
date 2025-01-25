const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Configure multer for video upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/original";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Video quality configurations
const videoQualities = [
  { resolution: "1080p", height: 1080, bitrate: "4000k" },
  { resolution: "720p", height: 720, bitrate: "2500k" },
  { resolution: "480p", height: 480, bitrate: "1500k" },
  { resolution: "360p", height: 360, bitrate: "1000k" },
  { resolution: "240p", height: 240, bitrate: "700k" },
  { resolution: "144p", height: 144, bitrate: "400k" },
];

// Process video into different qualities
async function processVideo(inputPath, videoId) {
  const processPromises = videoQualities.map((quality) => {
    return new Promise((resolve, reject) => {
      const outputDir = `uploads/processed/${videoId}`;
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, `${quality.resolution}.mp4`);

      ffmpeg(inputPath)
        .size(`?x${quality.height}`)
        .videoBitrate(quality.bitrate)
        .format("mp4")
        .on("end", () => resolve(outputPath))
        .on("error", (err) => reject(err))
        .save(outputPath);
    });
  });

  return Promise.all(processPromises);
}

// Upload endpoint
app.post("/upload", upload.single("video"), async (req, res) => {
  try {
    const videoId = Date.now().toString();
    await processVideo(req.file.path, videoId);
    res.json({ success: true, videoId });
  } catch (error) {
    console.error("Error processing video:", error);
    res.status(500).json({ error: "Video processing failed" });
  }
});

// Streaming endpoint
app.get("/stream/:videoId/:quality", (req, res) => {
  const { videoId, quality } = req.params;
  const videoPath = path.join(
    __dirname,
    "uploads/processed",
    videoId,
    `${quality}.mp4`
  );

  if (!fs.existsSync(videoPath)) {
    return res.status(404).send("Video not found");
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(videoPath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(200, head);
    fs.createReadStream(videoPath).pipe(res);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
