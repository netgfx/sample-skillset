const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const path = require("path"); // Added path module
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// GitHub App configuration - use a simple test secret for now
const GITHUB_WEBHOOK_SECRET =
  process.env.GITHUB_WEBHOOK_SECRET ||
  "e269ff8003eb6923fa31eeeaa65b506b88fcd111";

console.log("🔑 Using webhook secret:", GITHUB_WEBHOOK_SECRET);

// Verify GitHub signature middleware
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
    status: "healthy",
    service: "Astraea.AI Test Service",
    timestamp: new Date().toISOString(),
    endpoints: [
      "/api/test/greeting",
      "/api/test/analyze",
      "/api/test/file-links",
    ],
  });
});

app.post("/api/test/debug", verifyGitHubSignature, async (req, res) => {
  console.log("🐛 DEBUG ENDPOINT CALLED!");
  console.log("📥 Request body:", JSON.stringify(req.body, null, 2));
  console.log("📥 Request headers:", JSON.stringify(req.headers, null, 2));

  res.json({
    message: "🐛 DEBUG: This endpoint was successfully called!",
    timestamp: new Date().toISOString(),
    received_data: req.body,
    service_status: "ACTIVE AND RESPONDING",
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
      ...otherParams
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
      // Normalize filePath slashes (e.g., "src/components/Header.vue")
      const normalizedFilePath = filePath.replace(/\\/g, "/");
      let linkTarget;

      if (detectedWorkspace) {
        // Get the workspace folder name (e.g., "sample-skillset")
        const workspaceFolderName = path.basename(
          detectedWorkspace.replace(/\\/g, "/")
        );
        // Construct link target like "sample-skillset/src/components/Header.vue"
        linkTarget = `${workspaceFolderName}/${normalizedFilePath}`;
        // Ensure no double slashes if normalizedFilePath somehow started with one
        linkTarget = linkTarget.replace(/\/\//g, "/");
      } else {
        // Fallback if no workspace_path: use "./path/to/file"
        linkTarget = `./${normalizedFilePath}`;
      }

      // Line numbers are not added to the linkTarget URI itself for these relative formats,
      // as standard behavior for this in Markdown chat UIs is not guaranteed.
      // The line number is already in displayText.
      // console.log(`🔗 Creating link: [${displayText}](${linkTarget})`);
      return `[${displayText}](${linkTarget})`;
    };

    const responseMessage = `🔗 **File Link Test Results (Relative Links)**

${
  detectedWorkspace
    ? `✅ **Workspace Detected**: \`${detectedWorkspace}\`. Links are formatted as \`WORKSPACE_FOLDER_NAME/path/to/file\`.`
    : `⚠️ **No Workspace Path Provided**: Links are formatted as \`./path/to/file\`. Clickability may be limited.

💡 **For Best Results**: Ensure the workspace path is provided so links can be prefixed with the workspace folder name.`
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
• ${createFileLink("src/styles/main.css", 12)}
• ${createFileLink("tests/unit/service.test.js", 67)}
• ${createFileLink("config/webpack.config.js", 89)}

🔍 **Mock Code Review (Illustrative Links):**
**Security Issues:**
- SQL injection in ${createFileLink("test-service.js", 95)}
- Auth issue in ${createFileLink("src/auth/middleware.js", 15)}
- Credentials in ${createFileLink(".env.example", 5)}

📋 **Next Steps (Illustrative Links):**
🚨 Fix: ${createFileLink("test-service.js", 95)}
⚠️ Add auth: ${createFileLink("src/auth/middleware.js", 15)}
📋 Optimize: ${createFileLink("src/data/repository.js", 23)}

💡 **Code Suggestion (Diff):**
\`\`\`diff
--- a/test-service.js
+++ b/test-service.js
@@ -93,3 +93,3 @@
- const query = "SELECT * FROM users WHERE id = " + userId;
+ const query = "SELECT * FROM users WHERE id = ?";
+ const result = await db.execute(query, [userId]);
\`\`\`
🧪 **Debug Info:**
- Detected Workspace: \`${detectedWorkspace || "None"}\`
- Link Format: \`${
      detectedWorkspace ? "WORKSPACE_FOLDER_NAME/file/path" : "./file/path"
    }\`
- Sample Link: ${createFileLink("src/utils/helpers.js", 10)}

💡 **Note:** Clickability relies on VS Code Chat interpreting these relative paths correctly. Line numbers are for display; clicking will open the file.`;

    res.json({
      message: responseMessage,
      timestamp: new Date().toISOString(),
      status: "success",
      debug_info: {
        detected_workspace: detectedWorkspace,
        link_format_used: detectedWorkspace
          ? "workspace_folder_relative"
          : "dot_relative",
        example_link_target_structure: detectedWorkspace
          ? `${path.basename(detectedWorkspace)}/your_file.js`
          : "./your_file.js",
        request_parameters: Object.keys(req.body),
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
    console.log("🎯 Greeting endpoint called with:", req.body);
    const { name = "Developer" } = req.body;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = {
      message: `👋 Hello ${name}! This is a test response from Astraea.AI`,
      timestamp: new Date().toISOString(),
      received_data: req.body,
      status: "success",
    };
    console.log("📤 Sending response:", response);
    res.json(response);
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
    console.log("🔍 Analyze endpoint called with:", req.body);
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
        const workspaceFolderName = path.basename(
          currentWorkspacePath.replace(/\\/g, "/")
        );
        linkTarget = `${workspaceFolderName}/${normalizedFilePath}`.replace(
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
      // ... (rest of analysis object)
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
      suggestions: [
        "✨ Consider adding error handling for better robustness",
        "🚀 This code looks well-structured and follows good practices",
        "📝 Adding comments would improve code readability",
      ],
    };

    const response = {
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
      recommendations: `💡 **Recommendations:**\n${analysis.suggestions
        .map((s) => `• ${s}`)
        .join("\n")}`,
      related_files: `📁 **Related Files:**
• ${createFileLinkForAnalysis("test-service.js", null, analyzeWorkspacePath)}
• ${createFileLinkForAnalysis(
        "src/utils/helpers.js",
        null,
        analyzeWorkspacePath
      )}`,
      timestamp: new Date().toISOString(),
    };
    console.log("📤 Sending analysis response:", response);
    res.json(response);
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
      "Simple test service for GitHub Copilot Skillset integration with relative Markdown links.",
    // ... (endpoints description updated as needed)
    endpoints: {
      greeting: {
        url: "/api/test/greeting",
        method: "POST",
        description: "Simple greeting endpoint for testing",
        parameters: { name: "string (optional) - Name to greet" },
      },
      analyze: {
        url: "/api/test/analyze",
        method: "POST",
        description: "Mock code analysis endpoint using relative links",
        parameters: {
          code_snippet: "string (required) - Code to analyze",
          language: "string (optional) - Programming language",
          workspace_path:
            "string (optional) - Absolute path to the workspace for link generation",
        },
      },
      file_links: {
        url: "/api/test/file-links",
        method: "POST",
        description: "Test relative Markdown file linking for Copilot Chat",
        parameters: {
          workspace_path: "string (optional) - Absolute path to the workspace",
        },
      },
    },
    setup_instructions: [
      "1. Start this service: node test-service.js",
      "2. Expose with ngrok: ngrok http 3000",
      "3. Configure GitHub App skillset with the ngrok URLs",
      "4. Test file links with: @your-app-name test file links with workspace_path /your/project/path",
      "   (Replace /your/project/path with your actual project directory)",
    ],
  });
});

// Catch all for debugging
app.use("*", (req, res) => {
  console.log("🔍 Unhandled request:", {
    /* ... */
  });
  res.status(404).json({ error: "Endpoint not found" /* ... */ });
});

app.listen(PORT, () => {
  console.log("🚀 Astraea.AI Test Service started!");
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(
    "✨ Link strategy updated for /api/test/file-links and /api/test/analyze:"
  );
  console.log(
    "   - If workspace_path provided: links are 'WORKSPACE_FOLDER_NAME/file/path'"
  );
  console.log("   - If not: links are './file/path'");

  console.log("🧪 Test commands:");
  console.log("   @your-app-name say hello to Alice");
  console.log(
    '   @your-app-name analyze this JavaScript: function test() { return "hello"; }'
  );
  console.log("   @your-app-name test file links");
});
