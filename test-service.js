const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const path = require("path"); // Keep path module
const url = require("url"); // Added for robust file URL creation
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

/**
 * Creates a Markdown link for a file path.
 * If baseWorkspacePath is provided, it creates an absolute file:/// URI.
 * Otherwise, it creates a relative link.
 * @param {string} filePath - The path to the file (e.g., "src/file.js").
 * @param {number|null} line - Optional line number to append to the link.
 * @param {string|null} baseWorkspacePath - Optional absolute path to the workspace.
 * @returns {string} Markdown link string.
 */
const createFileLink = (filePath, line = null, baseWorkspacePath = null) => {
  // Normalize file path to use forward slashes for path operations and display consistency
  const normalizedFilePath = filePath.replace(/\\/g, "/");
  const linkTextForMarkdown = line
    ? `${normalizedFilePath}:${line}`
    : normalizedFilePath;
  let linkTarget;

  if (baseWorkspacePath) {
    try {
      // Resolve the absolute path to the file
      const systemAbsolutePath = path.resolve(
        baseWorkspacePath,
        normalizedFilePath
      );
      // Convert the system-specific absolute path to a file URL (e.g., file:///C:/path/to/file.js or file:///path/to/file.js)
      linkTarget = url.pathToFileURL(systemAbsolutePath).toString();

      if (line) {
        linkTarget += `#L${line}`;
      }
    } catch (e) {
      console.error(
        `Error creating file URL for workspace path "${baseWorkspacePath}" and file "${normalizedFilePath}":`,
        e
      );
      // Fallback to a simpler representation if URL creation fails
      linkTarget = `./${normalizedFilePath}`; // Fallback to relative link
      if (line) {
        linkTarget += `#L${line}`;
      }
    }
  } else {
    // No workspace path, create a relative link target
    linkTarget = `./${normalizedFilePath}`;
    if (line) {
      // Line numbers with relative paths are not standard for navigation but can be for display
      linkTarget += `#L${line}`;
    }
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
    console.log("🔗 File links endpoint called with:", req.body);

    const {
      workspace_path, // Primary field expected from client (VS Code extension)
      workspace_root,
      project_path,
      repository_path,
      editor_context,
      copilot_context,
      vscode_context,
    } = req.body;

    // Attempt to detect the workspace path from various potential fields provided by the client
    const detectedWorkspace =
      workspace_path ||
      workspace_root ||
      project_path ||
      repository_path ||
      editor_context?.workspace_path ||
      editor_context?.rootPath ||
      copilot_context?.workspace?.rootPath ||
      copilot_context?.workspaceFolder?.uri?.fsPath || // Added for typical VS Code extension context
      vscode_context?.workspace?.rootPath ||
      vscode_context?.workspaceFolders?.[0]?.uri?.fsPath || // Added for typical VS Code extension context
      null;

    console.log("🔍 Workspace detection results:", {
      provided_workspace_path: workspace_path, // Log the primary field checked
      detected_workspace: detectedWorkspace,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const responseMessage = `🔗 **File Link Test Results (Absolute/Relative Path Links)**

${
  detectedWorkspace
    ? `✅ **Workspace Detected**: \`${detectedWorkspace}\`. Links are formatted as absolute \`file:///\` URIs.`
    : `⚠️ **No Workspace Path Provided/Detected**: Links are formatted as relative paths (\`./path/to/file\`). Clickability may be limited.

💡 **For Best Results**: Ensure your client (e.g., VS Code extension) sends the workspace path (e.g., as 'workspace_path').`
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
- Detected Workspace: \`${detectedWorkspace || "None"}\`
- Link Format: \`${detectedWorkspace ? "ABSOLUTE_FILE_URI" : "RELATIVE_PATH"}\`
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
        detected_workspace: detectedWorkspace,
        link_format_used: detectedWorkspace
          ? "markdown_absolute_file_uri"
          : "markdown_relative_path",
        example_link_target_structure: detectedWorkspace
          ? `file:///.../${"your_file.js"}` // Simplified example
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
      workspace_path: analyzeWorkspacePath, // Expecting client to send this
    } = req.body;

    if (!code_snippet) {
      return res
        .status(400)
        .json({ error: "Missing required parameter: code_snippet" });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // analyzeWorkspacePath will be used by createFileLink if provided
    console.log(
      "🔬 Analyze endpoint using workspace path:",
      analyzeWorkspacePath
    );

    const analysis = {
      language: language,
      lines_of_code: code_snippet.split("\n").length,
      issues_found: [
        {
          type: "style",
          severity: "low",
          description: "Use const",
          line: 2,
          file: "test-service.js", // Relative to workspace, or could be absolute
        },
        {
          type: "performance",
          severity: "medium",
          description: "Loop optimization",
          line: 50,
          file: "src/utils/helpers.js", // Relative to workspace
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
        analyzeWorkspacePath // Pass workspace path here
      )} - ${analysis.issues_found[0].description}
• Perf: ${createFileLink(
        analysis.issues_found[1].file,
        analysis.issues_found[1].line,
        analyzeWorkspacePath // Pass workspace path here
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

// Root endpoint with service info
app.get("/", (req, res) => {
  console.log("🏠 Root endpoint accessed");
  res.json({
    service: "Astraea.AI Test Service",
    version: "1.1.0",
    description:
      "Test service with Markdown links using absolute file URIs (if workspace provided by client) or relative paths.",
    endpoints: {
      greeting: {
        url: "/api/test/greeting",
        method: "POST",
        description: "Simple greeting endpoint.",
        parameters: {
          name: "string (optional) - Name to greet.",
        },
      },
      analyze: {
        url: "/api/test/analyze",
        method: "POST",
        description:
          "Mock code analysis. Creates file links using workspace_path if provided by client.",
        parameters: {
          code_snippet: "string (required) - Code to analyze.",
          language: "string (optional) - Language of the code snippet.",
          workspace_path:
            "string (optional) - Absolute path to the workspace for generating clickable file links. Client (e.g. VS Code extension) should provide this.",
        },
      },
      file_links: {
        url: "/api/test/file-links",
        method: "POST",
        description:
          "Test Markdown file linking. Uses workspace_path (or other supported fields) if provided by client to create absolute file URIs.",
        parameters: {
          workspace_path:
            "string (optional) - Absolute path to the workspace. Other fields like 'workspace_root', 'editor_context.workspace_path', 'copilot_context.workspaceFolder.uri.fsPath' are also checked.",
        },
      },
      debug: {
        url: "/api/test/debug",
        method: "POST",
        description: "Simple debug endpoint to inspect request body.",
      },
    },
    setup_instructions: [
      "The client (e.g., your VS Code extension) should obtain the active workspace path (e.g., using 'vscode.workspace.workspaceFolders[0].uri.fsPath').",
      "Send this path in the JSON body of POST requests to /api/test/file-links or /api/test/analyze under the 'workspace_path' key (or other supported keys like 'copilot_context.workspaceFolder.uri.fsPath').",
      "If no valid workspace path is provided by the client, links will be generated as relative paths.",
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
    "✨ Link strategy: Markdown with absolute file:/// URI (if workspace path provided by client) or relative path."
  );

  console.log(
    "🧪 Test commands (examples for how a client might invoke the service):"
  );
  console.log(
    '   Client POST to /api/test/greeting with JSON: { "name": "Alice" }'
  );
  console.log(
    '   Client POST to /api/test/analyze with JSON: { "code_snippet": "function test() { return \\"hello\\"; }", "workspace_path": "/path/to/your/workspace" }'
  );
  console.log(
    '   Client POST to /api/test/file-links with JSON: { "workspace_path": "C:\\path\\to\\your\\workspace" })'
  );
});
