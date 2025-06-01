const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const path = require("path"); // Keep path module
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

app.get("/health", (req, res) => {
  console.log("💚 Health check requested");
  res.json({
    /* ... */
  });
});

app.post("/api/test/debug", verifyGitHubSignature, async (req, res) => {
  console.log("🐛 DEBUG ENDPOINT CALLED!");
  console.log("📥 Request body:", JSON.stringify(req.body, null, 2));
  res.json({
    /* ... */
  });
});

app.post("/api/test/file-links", verifyGitHubSignature, async (req, res) => {
  try {
    console.log("🔗 File links endpoint called with:", req.body);

    const {
      workspace_path,
      workspace_root,
      project_path,
      repository_path,
      editor_context,
      copilot_context,
      vscode_context,
    } = req.body;

    const detectedWorkspace =
      workspace_path ||
      workspace_root ||
      project_path ||
      repository_path ||
      editor_context?.workspace_path ||
      editor_context?.rootPath ||
      copilot_context?.workspace?.rootPath ||
      copilot_context?.workspaceFolder ||
      vscode_context?.workspace?.rootPath ||
      null;

    console.log("🔍 Workspace detection results:", {
      provided_workspace_path: workspace_path,
      detected_workspace: detectedWorkspace,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const createFileLink = (filePath, line = null) => {
      const displayText = line ? `${filePath}:${line}` : filePath;
      const normalizedFilePath = filePath.replace(/\\/g, "/"); // e.g., "src/file.js"
      let linkTarget;

      if (detectedWorkspace) {
        const normalizedWorkspace = detectedWorkspace.replace(/\\/g, "/");
        // Construct absolute path: /path/to/workspace/src/file.js
        linkTarget = `${normalizedWorkspace}/${normalizedFilePath}`;
        linkTarget = linkTarget.replace(/\/\//g, "/"); // Ensure no double slashes
        // Optionally, prefix with file:/// if plain absolute path doesn't work
        //linkTarget = `file://${linkTarget}`; // Note: file:// (two slashes for local) or file:/// (three for UNC/empty authority)
        // For local files, file:///path is common.
      } else {
        linkTarget = `./${normalizedFilePath}`; // Fallback
      }

      // Line numbers are not standard in plain path or file:/// URIs for Markdown link targets.
      // They remain in displayText.
      // console.log(`🔗 Creating link: [${displayText}](${linkTarget})`);
      return `[${displayText}](${linkTarget})`;
    };

    const responseMessage = `🔗 **File Link Test Results (Absolute/Relative Path Links)**

${
  detectedWorkspace
    ? `✅ **Workspace Detected**: \`${detectedWorkspace}\`. Links are formatted as plain absolute paths.`
    : `⚠️ **No Workspace Path Provided**: Links are formatted as \`./path/to/file\`. Clickability may be limited.

💡 **For Best Results**: Ensure the workspace path is provided.`
}

📁 **File Links:**
• ${createFileLink("test-service.js")}
• ${createFileLink("package.json")}
• ${createFileLink(".env")}
• ${createFileLink("README.md")}

📍 **File Links with Line Numbers (Display Only):**
• ${createFileLink("test-service.js", 1)}
• ${createFileLink("test-service.js", 25)}
• ${createFileLink("test-service.js", 150)}
• ${createFileLink("package.json", 5)}
• ${createFileLink("package.json", 10)}

📂 **Directory Structure Examples:**
• ${createFileLink("src/components/Header.vue")}
• ${createFileLink("src/utils/helpers.js", 45)}

🧪 **Debug Info:**
- Detected Workspace: \`${detectedWorkspace || "None"}\`
- Link Format: \`${
      detectedWorkspace ? "ABSOLUTE_PATH_AS_TARGET" : "./file/path"
    }\`
- Sample Link Target (if workspace detected): ${
      detectedWorkspace
        ? `${detectedWorkspace.replace(
            /\\/g,
            "/"
          )}/${"src/utils/helpers.js".replace(/\\/g, "/")}`.replace(
            /\/\//g,
            "/"
          )
        : "N/A"
    }
- Sample Link Markdown (if workspace detected): ${createFileLink(
      "src/utils/helpers.js",
      10
    )}

💡 **Note:** Clickability relies on VS Code Chat interpreting these paths correctly. Line numbers are for display; clicking will open the file.`;

    res.json({
      message: responseMessage,
      timestamp: new Date().toISOString(),
      status: "success",
      debug_info: {
        detected_workspace: detectedWorkspace,
        link_format_used: detectedWorkspace
          ? "markdown_absolute_path"
          : "markdown_dot_relative",
        example_link_target_structure: detectedWorkspace
          ? `${detectedWorkspace}/your_file.js`
          : "./your_file.js",
      },
    });
  } catch (error) {
    console.error("❌ Error in file links endpoint:", error);
    res
      .status(500)
      .json({ error: "Internal server error in file links endpoint" });
  }
});

// Test endpoint 1: Simple greeting
app.post("/api/test/greeting", verifyGitHubSignature, async (req, res) => {
  try {
    // ... (greeting logic)
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

// Test endpoint 2: Mock code analysis
app.post("/api/test/analyze", verifyGitHubSignature, async (req, res) => {
  try {
    const {
      code_snippet,
      language = "javascript",
      workspace_path: analyzeWorkspacePath,
    } = req.body;

    if (!code_snippet) {
      return res
        .status(400)
        .json({ error: "Missing required parameter: code_snippet" });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const createFileLinkForAnalysis = (
      filePath,
      line = null,
      currentWorkspacePath
    ) => {
      const displayText = line ? `${filePath}:${line}` : filePath;
      const normalizedFilePath = filePath.replace(/\\/g, "/");
      let linkTarget;
      if (currentWorkspacePath) {
        const normalizedWorkspace = currentWorkspacePath.replace(/\\/g, "/");
        linkTarget = `${normalizedWorkspace}/${normalizedFilePath}`.replace(
          /\/\//g,
          "/"
        );
      } else {
        linkTarget = `./${normalizedFilePath}`;
      }
      return `[${displayText}](${linkTarget})`;
    };

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
• Style: ${createFileLinkForAnalysis(
        analysis.issues_found[0].file,
        analysis.issues_found[0].line,
        analyzeWorkspacePath
      )} - ${analysis.issues_found[0].description}
• Perf: ${createFileLinkForAnalysis(
        analysis.issues_found[1].file,
        analysis.issues_found[1].line,
        analyzeWorkspacePath
      )} - ${analysis.issues_found[1].description}`,
      analysis: analysis,
      // ... (rest of response)
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error in analyze endpoint:", error);
    res
      .status(500)
      .json({ error: "Internal server error in analyze endpoint" });
  }
});

// Root endpoint with service info
app.get("/", (req, res) => {
  console.log("🏠 Root endpoint accessed");
  res.json({
    service: "Astraea.AI Test Service",
    version: "1.0.0",
    description:
      "Test service with Markdown links using absolute paths (if workspace provided).",
    // ... (endpoints description updated)
    endpoints: {
      greeting: {
        /* ... */
      },
      analyze: {
        url: "/api/test/analyze",
        method: "POST",
        description: "Mock code analysis using absolute/relative path links",
        parameters: {
          // ...
          workspace_path:
            "string (optional) - Absolute path to the workspace for link generation",
        },
      },
      file_links: {
        url: "/api/test/file-links",
        method: "POST",
        description: "Test Markdown file linking using absolute/relative paths",
        parameters: {
          workspace_path: "string (optional) - Absolute path to the workspace",
        },
      },
    },
    setup_instructions: [
      /* ... */
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
    "✨ Link strategy: Markdown with absolute path (if workspace) or relative path."
  );

  console.log("🧪 Test commands:");
  console.log("   @your-app-name say hello to Alice");
  console.log(
    '   @your-app-name analyze this JavaScript: function test() { return "hello"; }'
  );
  console.log("   @your-app-name test file links");
});
