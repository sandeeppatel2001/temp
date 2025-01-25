const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const logger = require("../config/logger");

class ChunkManager {
  constructor() {
    this.uploadsDir = path.join(__dirname, "../tempuploads");
  }

  async initializeUpload(uploadId, totalChunks, filename) {
    try {
      const uploadDir = path.join(this.uploadsDir, uploadId);
      await fs.mkdir(uploadDir, { recursive: true });

      await fs.writeFile(
        path.join(uploadDir, "metadata.json"),
        JSON.stringify({
          totalChunks: parseInt(totalChunks),
          receivedChunks: 0,
          filename,
          completed: false,
        })
      );
    } catch (error) {
      console.log("error in initializeUpload", error);
      logger.error(`Error initializing upload: ${error.message}`);
      throw error;
    }
  }

  async saveChunk(uploadId, chunkNumber, chunkFile) {
    const uploadDir = path.join(this.uploadsDir, uploadId);
    const metadataPath = path.join(uploadDir, "metadata.json");

    try {
      const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));

      // Move chunk file to final location
      const finalChunkPath = path.join(uploadDir, `chunk-${chunkNumber}`);
      await fs.rename(chunkFile.path, finalChunkPath);
      console.log("saving chunk", finalChunkPath);
      metadata.receivedChunks++;
      await fs.writeFile(metadataPath, JSON.stringify(metadata));

      return metadata.receivedChunks === metadata.totalChunks;
    } catch (error) {
      console.log("error in saveChunk", error);
      logger.error(`Error saving chunk: ${error.message}`);
      throw error;
    }
  }

  async combineChunks(uploadId) {
    console.log("combineChunks----------------", uploadId);
    const uploadDir = path.join(this.uploadsDir, uploadId);
    const metadata = JSON.parse(
      await fs.readFile(path.join(uploadDir, "metadata.json"), "utf8")
    );

    const finalPath = path.join(uploadDir, "final.mp4");
    const writeStream = fsSync.createWriteStream(finalPath);

    try {
      for (let i = 0; i < metadata.totalChunks; i++) {
        const chunkPath = path.join(uploadDir, `chunk-${i}`);
        const chunkData = await fs.readFile(chunkPath);
        writeStream.write(chunkData);

        // Clean up chunk after combining
        await fs.unlink(chunkPath);
      }

      writeStream.end();

      // Wait for the stream to finish
      await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      return finalPath;
    } catch (error) {
      console.log("error in combineChunks", error);
      logger.error(`Error combining chunks: ${error.message}`);
      throw error;
    }
  }

  async cleanup(uploadId) {
    try {
      const uploadDir = path.join(this.uploadsDir, uploadId);
      await fs.rm(uploadDir, { recursive: true, force: true });
    } catch (error) {
      console.log("error in cleanup", error);
      logger.error(`Error cleaning up upload directory: ${error.message}`);
      // Don't throw the error as this is cleanup
    }
  }

  async getUploadProgress(uploadId) {
    try {
      const metadataPath = path.join(
        this.uploadsDir,
        uploadId,
        "metadata.json"
      );
      const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
      return {
        totalChunks: metadata.totalChunks,
        receivedChunks: metadata.receivedChunks,
        progress: (metadata.receivedChunks / metadata.totalChunks) * 100,
      };
    } catch (error) {
      console.log("error in getUploadProgress", error);
      logger.error(`Error getting upload progress: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new ChunkManager();
