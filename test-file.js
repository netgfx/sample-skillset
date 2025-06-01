// test-file.js - Utility functions for testing file linking

const fs = require("fs");
const path = require("path");

// Helper function to validate file paths
function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("Invalid file path provided");
  }
  return path.resolve(filePath);
}

// Function to read file contents (line 10 - referenced in file links test)
function readFileContents(filePath) {
  try {
    const validPath = validateFilePath(filePath);
    return fs.readFileSync(validPath, "utf8");
  } catch (error) {
    console.error("Error reading file:", error.message);
    throw error;
  }
}

// Function to check if file exists
function fileExists(filePath) {
  try {
    const validPath = validateFilePath(filePath);
    return fs.existsSync(validPath);
  } catch (error) {
    return false;
  }
}

// Error handling block (lines 25-30 - referenced in file links test)
function processFileWithErrorHandling(filePath, callback) {
  try {
    if (!fileExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const content = readFileContents(filePath);
    return callback(content);
  } catch (error) {
    console.error("File processing error:", error.message);
    return null;
  }
}

// Function to get file statistics
function getFileStats(filePath) {
  try {
    const validPath = validateFilePath(filePath);
    const stats = fs.statSync(validPath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    };
  } catch (error) {
    console.error("Error getting file stats:", error.message);
    return null;
  }
}

// Export functions for use in other modules
module.exports = {
  validateFilePath,
  readFileContents,
  fileExists,
  processFileWithErrorHandling,
  getFileStats,
};

// Example usage (for testing purposes)
if (require.main === module) {
  console.log("🧪 Testing file utilities...");

  // Test with current file
  const currentFile = __filename;
  console.log("Current file:", currentFile);
  console.log("File exists:", fileExists(currentFile));
  console.log("File stats:", getFileStats(currentFile));

  // Test error handling
  processFileWithErrorHandling("non-existent-file.txt", (content) => {
    console.log("File content length:", content.length);
  });
}
