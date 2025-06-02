const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const path = require("path");
const url = require("url"); // For robust file URL creation
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

const GITHUB_WEBHOOK_SECRET =
  process.env.GITHUB_WEBHOOK_SECRET ||
  "e269ff8003eb6923fa31eeeaa65b506b88fcd111";

console.log("🔑 Using webhook secret:", GITHUB_WEBHOOK_SECRET);

// Helper function to clean path strings
function cleanPathString(p) {
  if (typeof p !== "string") {
    return null;
  }
  let cleanedPath = p.trim(); // Trim leading/trailing whitespace

  // Remove trailing dots, slashes, or backslashes iteratively
  while (
    cleanedPath.length > 0 &&
    [".", "/", "\\"].includes(cleanedPath[cleanedPath.length - 1])
  ) {
    cleanedPath = cleanedPath.slice(0, -1);
  }
  // Return null if path becomes empty after cleaning, or the cleaned path
  return cleanedPath.length > 0 ? cleanedPath : null;
}

function verifyGitHubSignature(req, res, next) {
  console.log("🧪 TESTING MODE: Skipping signature verification");
  return next();

  // ... (rest of signature verification logic remains the same)
  const signature =
    req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];

  console.log("📥 Incoming request:", {
    method: req.method,
    url: req.url,
    headers: {
      "x-hub-signature-256": req.headers["x-hub-signature-256"],
      "x-hub-signature": req.headers["x-hub-signature"],
      "content-type": req.headers["content-type"],
      "user-agent": req.headers["user-agent"],
      authorization: req.headers["authorization"] ? "Present" : "Not present",
    },
  });

  if (!signature) {
    console.log(
      "⚠️  No signature provided - allowing for testing (REMOVE FOR PRODUCTION)"
    );
    console.log("🔍 All headers:", req.headers);
    return next();
  }

  const payload = JSON.stringify(req.body);
  let expectedSignature;
  let receivedSig = signature;

  if (signature.startsWith("sha256=")) {
    expectedSignature =
      "sha256=" +
      crypto
        .createHmac("sha256", GITHUB_WEBHOOK_SECRET)
        .update(payload, "utf8")
        .digest("hex");
  } else if (signature.startsWith("sha1=")) {
    expectedSignature =
      "sha1=" +
      crypto
        .createHmac("sha1", GITHUB_WEBHOOK_SECRET)
        .update(payload, "utf8")
        .digest("hex");
  } else {
    const sha256Hash = crypto
      .createHmac("sha256", GITHUB_WEBHOOK_SECRET)
      .update(payload, "utf8")
      .digest("hex");
    const sha1Hash = crypto
      .createHmac("sha1", GITHUB_WEBHOOK_SECRET)
      .update(payload, "utf8")
      .digest("hex");

    console.log("🔐 Signature verification (no prefix):", {
      received: signature,
      expected_sha256: "sha256=" + sha256Hash,
      expected_sha1: "sha1=" + sha1Hash,
      payload_length: payload.length,
      payload_sample: payload.substring(0, 100),
    });

    if (signature === sha256Hash || signature === sha1Hash) {
      console.log("✅ Signature verified successfully (no prefix)");
      return next();
    } else {
      console.log("❌ Invalid signature (no prefix)");
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  console.log("🔐 Signature verification:", {
    received: receivedSig,
    expected: expectedSignature,
    payload_length: payload.length,
    payload_sample: payload.substring(0, 100),
  });

  try {
    if (receivedSig.length !== expectedSignature.length) {
      console.log("❌ Signature length mismatch");
      return res.status(401).json({ error: "Invalid signature format" });
    }
    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedSig),
        Buffer.from(expectedSignature)
      )
    ) {
      console.log("❌ Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
    console.log("✅ Signature verified successfully");
    next();
  } catch (error) {
    console.log("❌ Signature verification error:", error.message);
    return res.status(401).json({ error: "Signature verification failed" });
  }
}

/**
 * Creates a Markdown link for a file path.
 * If baseWorkspacePath is provided and valid, it creates an absolute file:/// URI.
 * Otherwise, it creates a relative link.
 * @param {string} filePath - The path to the file (e.g., "src/file.js").
 * @param {number|null} line - Optional line number to append to the link.
 * @param {string|null} baseWorkspacePath - Optional absolute path to the workspace.
 * @returns {string} Markdown link string.
 */
const createFileLink = (filePath, line = null, baseWorkspacePath = null) => {
  const normalizedFilePath = filePath.replace(/\\/g, "/");
  const linkTextForMarkdown = line
    ? `${normalizedFilePath}:${line}`
    : normalizedFilePath;
  let linkTarget;

  // Ensure baseWorkspacePath is a non-empty string after potential cleaning
  const validBaseWorkspacePath =
    typeof baseWorkspacePath === "string" && baseWorkspacePath.trim() !== "";

  if (validBaseWorkspacePath) {
    try {
      // path.resolve will correctly join an absolute baseWorkspacePath with a relative/absolute filePath.
      // If filePath is already absolute, resolve might just return it (depending on OS and exact paths).
      // It's generally safer if filePath is relative to baseWorkspacePath.
      const systemAbsolutePath = path.resolve(
        baseWorkspacePath,
        normalizedFilePath
      );
      linkTarget = url.pathToFileURL(systemAbsolutePath).toString();
      if (line) {
        linkTarget += `#L${line}`;
      }
    } catch (e) {
      console.error(
        `Error creating file URL for workspace path "${baseWorkspacePath}" and file "${normalizedFilePath}":`,
        e.message
      );
      linkTarget = `./${normalizedFilePath}`; // Fallback
      if (line) linkTarget += `#L${line}`;
    }
  } else {
    linkTarget = `./${normalizedFilePath}`;
    if (line) linkTarget += `#L${line}`;
  }
  return `[${linkTextForMarkdown}](${linkTarget})`;
};

app.get("/health", (req, res) => {
  console.log("💚 Health check requested");
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/test/debug", verifyGitHubSignature, async (req, res) => {
  console.log("🐛 DEBUG ENDPOINT CALLED!");
  console.log("📥 Request body:", JSON.stringify(req.body, null, 2));
  res.json({
    message: "Debug data received",
    received_body: req.body,
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/test/file-links", verifyGitHubSignature, async (req, res) => {
  try {
    console.log(
      "🔗 File links endpoint called with (raw body):",
      JSON.stringify(req.body, null, 2)
    );

    // Log raw path fields for debugging
    console.log("Raw path fields from request body:", {
      workspace_path_raw: req.body.workspace_path,
      workspace_root_raw: req.body.workspace_root,
      project_path_raw: req.body.project_path,
      repository_path_raw: req.body.repository_path,
      editor_context_workspace_path_raw:
        req.body.editor_context?.workspace_path,
      editor_context_rootPath_raw: req.body.editor_context?.rootPath,
      copilot_context_workspace_rootPath_raw:
        req.body.copilot_context?.workspace?.rootPath,
      copilot_context_workspaceFolder_uri_fsPath_raw:
        req.body.copilot_context?.workspaceFolder?.uri?.fsPath,
      vscode_context_workspace_rootPath_raw:
        req.body.vscode_context?.workspace?.rootPath,
      vscode_context_workspaceFolders_0_uri_fsPath_raw:
        req.body.vscode_context?.workspaceFolders?.[0]?.uri?.fsPath,
    });

    const {
      workspace_path,
      workspace_root,
      project_path,
      repository_path,
      editor_context,
      copilot_context,
      vscode_context,
    } = req.body;

    // Clean and then select the first valid path
    const detectedWorkspace =
      cleanPathString(workspace_path) ||
      cleanPathString(workspace_root) ||
      cleanPathString(project_path) ||
      cleanPathString(repository_path) ||
      cleanPathString(editor_context?.workspace_path) ||
      cleanPathString(editor_context?.rootPath) ||
      cleanPathString(copilot_context?.workspace?.rootPath) ||
      cleanPathString(copilot_context?.workspaceFolder?.uri?.fsPath) ||
      cleanPathString(vscode_context?.workspace?.rootPath) ||
      cleanPathString(vscode_context?.workspaceFolders?.[0]?.uri?.fsPath) ||
      null;

    console.log("💡 Cleaned & Detected Workspace Path:", detectedWorkspace);
    if (!detectedWorkspace) {
      console.warn(
        "⚠️ No valid workspace path could be determined from the request. Links will be relative."
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const responseMessage = `🔗 **File Link Test Results (Absolute/Relative Path Links)**

${
  detectedWorkspace
    ? `✅ **Workspace Detected & Cleaned**: \`${detectedWorkspace}\`. Links are formatted as absolute \`file:///\` URIs.`
    : `⚠️ **No Valid Workspace Path Provided/Detected**: Links are formatted as relative paths (\`./path/to/file\`). Clickability may be limited.

💡 **For Best Results**: Ensure your client (e.g., VS Code extension) sends a correct and absolute workspace path (e.g., as 'workspace_path').`
}

📁 **File Links:**
• ${createFileLink("test-service.js", null, detectedWorkspace)}
• ${createFileLink("package.json", null, detectedWorkspace)}
• ${createFileLink(".env", null, detectedWorkspace)}
• ${createFileLink("README.md", null, detectedWorkspace)}

📍 **File Links with Line Numbers:**
• ${createFileLink("test-service.js", 1, detectedWorkspace)}
• ${createFileLink("test-service.js", 25, detectedWorkspace)}
• ${createFileLink("test-service.js", 150, detectedWorkspace)}
• ${createFileLink("package.json", 5, detectedWorkspace)}
• ${createFileLink("package.json", 10, detectedWorkspace)}

📂 **Directory Structure Examples:**
• ${createFileLink("src/components/Header.vue", null, detectedWorkspace)}
• ${createFileLink("src/utils/helpers.js", 45, detectedWorkspace)}

🧪 **Debug Info:**
- Detected Workspace (Cleaned): \`${detectedWorkspace || "None"}\`
- Link Format Strategy: \`${
      detectedWorkspace ? "ABSOLUTE_FILE_URI" : "RELATIVE_PATH"
    }\`
- Sample Link Target (if workspace detected): ${
      detectedWorkspace
        ? url
            .pathToFileURL(
              path.resolve(detectedWorkspace, "src/utils/helpers.js")
            )
            .toString() + "#L10"
        : "N/A"
    }
- Sample Link Markdown (if workspace detected): ${createFileLink(
      "src/utils/helpers.js",
      10,
      detectedWorkspace
    )}

💡 **Note:** Clickability relies on the chat UI (e.g., VS Code Chat) interpreting these \`file:/// \` URIs or relative paths correctly. Line numbers are appended with \`#L<line>\`.`;

    res.json({
      message: responseMessage,
      timestamp: new Date().toISOString(),
      status: "success",
      debug_info: {
        detected_workspace_cleaned: detectedWorkspace,
        link_format_used: detectedWorkspace
          ? "markdown_absolute_file_uri"
          : "markdown_relative_path",
      },
    });
  } catch (error) {
    console.error("❌ Error in file links endpoint:", error);
    res
      .status(500)
      .json({ error: "Internal server error in file links endpoint" });
  }
});

app.post("/api/test/greeting", verifyGitHubSignature, async (req, res) => {
  try {
    const { name = "Developer" } = req.body;
    await new Promise((resolve) => setTimeout(resolve, 500));
    res.json({
      message: `👋 Hello ${name}! This is a test response from Astraea.AI`,
      timestamp: new Date().toISOString(),
      received_data: req.body,
      status: "success",
    });
  } catch (error) {
    console.error("❌ Error in greeting endpoint:", error);
    res
      .status(500)
      .json({ error: "Internal server error in greeting endpoint" });
  }
});

app.post("/api/test/analyze", verifyGitHubSignature, async (req, res) => {
  try {
    const {
      code_snippet,
      language = "javascript",
      workspace_path: raw_analyzeWorkspacePath, // Expecting client to send this
    } = req.body;

    if (!code_snippet) {
      return res
        .status(400)
        .json({ error: "Missing required parameter: code_snippet" });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const analyzeWorkspacePath = cleanPathString(raw_analyzeWorkspacePath);
    console.log(
      "🔬 Analyze endpoint using cleaned workspace path:",
      analyzeWorkspacePath
    );
    if (!analyzeWorkspacePath) {
      console.warn(
        "⚠️ Analyze: No valid workspace path provided for analysis links. Links will be relative."
      );
    }

    const analysis = {
      language: language,
      lines_of_code: code_snippet.split("\n").length,
      issues_found: [
        {
          type: "style",
          severity: "low",
          description: "Use const",
          line: 2,
          file: "test-service.js",
        },
        {
          type: "performance",
          severity: "medium",
          description: "Loop optimization",
          line: 50,
          file: "src/utils/helpers.js",
        },
      ],
      suggestions: ["Suggestion 1", "Suggestion 2"],
    };

    res.json({
      message: `🔍 **Code Analysis Complete**`,
      summary: `Analyzed ${analysis.lines_of_code} lines of ${language} code.`,
      issues_with_file_links: `🔍 **Issues Found:**
• Style: ${createFileLink(
        analysis.issues_found[0].file,
        analysis.issues_found[0].line,
        analyzeWorkspacePath
      )} - ${analysis.issues_found[0].description}
• Perf: ${createFileLink(
        analysis.issues_found[1].file,
        analysis.issues_found[1].line,
        analyzeWorkspacePath
      )} - ${analysis.issues_found[1].description}`,
      analysis: analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error in analyze endpoint:", error);
    res
      .status(500)
      .json({ error: "Internal server error in analyze endpoint" });
  }
});

app.get("/", (req, res) => {
  console.log("🏠 Root endpoint accessed");
  res.json({
    service: "Astraea.AI Test Service",
    version: "1.2.0", // Incremented version
    description:
      "Test service for Markdown file links. Relies on client (e.g., VS Code extension) to provide an accurate absolute workspace path for generating `file:///` URIs. Cleans received path strings.",
    endpoints: {
      /* ... updated descriptions ... */
    },
    setup_instructions: [
      "The client (e.g., your VS Code extension) MUST obtain the active workspace's absolute filesystem path (e.g., using 'vscode.workspace.workspaceFolders[0].uri.fsPath').",
      "Send this path in the JSON body of POST requests (e.g. to /api/test/file-links or /api/test/analyze) under the 'workspace_path' key.",
      "The service will attempt to clean this path (trimming, removing trailing dots/slashes).",
      "If no valid workspace path is provided or determined, links will be generated as relative paths, which may not be clickable or resolve correctly in all chat UIs.",
    ],
  });
});

app.use("*", (req, res) => {
  console.log("🔍 Unhandled request:", req.method, req.url);
  res.status(404).json({ error: "Endpoint not found" });
});

app.listen(PORT, () => {
  console.log("🚀 Astraea.AI Test Service started!");
  console.log(`📡 Server running on port ${PORT}`);
  console.log(
    "✨ Link strategy: Markdown with absolute file:/// URI (if a correct workspace path is provided by the client and cleaned successfully) or relative path."
  );
});
