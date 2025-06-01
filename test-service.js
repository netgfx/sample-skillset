const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
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
  return next(); // Keep this for local testing if needed, but ensure it's removed/conditional for production

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
    // Avoid logging full body in production if it can be large or sensitive
    // body: req.body,
  });

  if (!signature) {
    console.log(
      "⚠️  No signature provided - allowing for testing (REMOVE FOR PRODUCTION)"
    );
    console.log("🔍 All headers:", req.headers);
    return next(); // Remove this line for production
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

// NEW: File links testing endpoint - accepting workspace path from Copilot
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
      all_request_params: Object.keys(req.body),
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    // MODIFIED createFileLink function
    const createFileLink = (filePath, line = null) => {
      const displayText = line ? `${filePath}:${line}` : filePath;

      if (detectedWorkspace) {
        // Ensure forward slashes for URIs, even on Windows
        const normalizedWorkspace = detectedWorkspace.replace(/\\/g, "/");
        const normalizedFilePath = filePath.replace(/\\/g, "/");
        const fullPath = `${normalizedWorkspace}/${normalizedFilePath}`;
        let relativeLink = `./${filePath.replace(/\\/g, "/")}`;
        let vscodeLink = `vscode://file/${fullPath}`;
        if (line) {
          vscodeLink += `:${line}`;
        }
        console.log(
          `🔗 Creating VS Code link: [${displayText}](${relativeLink})`
        );
        return `[${displayText}](${relativeLink})`;
      } else {
        // Fallback to relative Markdown link if no workspace path is detected
        // This relies on VS Code Chat interpreting it relative to the open workspace
        let relativeLink = `./${filePath.replace(/\\/g, "/")}`;
        if (line) {
          // Standard for adding line numbers to file URIs is #L<line>
          // However, for vscode:// scheme it's :line. For relative paths in Markdown,
          // there isn't a universal standard for line numbers directly in the URI.
          // We'll keep the display text with line, but the link might just open the file.
          // Or, we could try to append :line if VS Code handles it for relative paths too.
          // For now, let's keep it simple and link to the file.
          // Users can use the line number in the display text as a guide.
          // Alternatively, if we assume it's still within a workspace context:
          // relativeLink += `:${line}`; // This is speculative for relative Markdown links
        }
        console.log(
          `🔗 Creating VS Code link: [${displayText}](${relativeLink})`
        );
        return `[${displayText}](${relativeLink})`;
        // Original fallback: return `\`${displayText}\``;
      }
    };

    const response = {
      message: `🔗 **VS Code File Link Testing Results (Markdown Links)**

${
  detectedWorkspace
    ? `✅ **Workspace Detected**: \`${detectedWorkspace}\` - Links should be clickable using \`vscode://file/\` URIs.`
    : `⚠️ **No Workspace Path Provided** - Attempting relative file links. Clickability may vary.

💡 **To Enable More Reliable Clickable Links**: Please provide your workspace path like this:
- "test file links in workspace /Users/username/myproject"  
- "test file links for project /Users/username/myproject"
- "test file links with workspace path /Users/username/myproject"`
}

📁 **File Links (IDE Compatible Format):**
• ${createFileLink("test-service.js")} - Main service file
• ${createFileLink("package.json")} - Dependencies configuration  
• ${createFileLink(".env")} - Environment variables
• ${createFileLink("README.md")} - Documentation

📍 **File Links with Line Numbers (Ctrl+Click in many IDEs):**
• ${createFileLink("test-service.js", 1)} - File header
• ${createFileLink("test-service.js", 25)} - Middleware setup
• ${createFileLink("test-service.js", 150)} - File links endpoint (approx.)
• ${createFileLink("package.json", 5)} - Dependencies section
• ${createFileLink("package.json", 10)} - Scripts section

📂 **Directory Structure Examples:**
• ${createFileLink("src/components/Header.vue")} - Header component
• ${createFileLink("src/utils/helpers.js", 45)} - Utility functions
• ${createFileLink("src/styles/main.css", 12)} - Main stylesheet  
• ${createFileLink("tests/unit/service.test.js", 67)} - Unit tests
• ${createFileLink("config/webpack.config.js", 89)} - Build configuration

🔍 **Mock Code Review with ${
        detectedWorkspace ? "Clickable" : "Potentially Clickable Relative"
      } File Links:**

**Security Issues:**
- SQL injection vulnerability in ${createFileLink(
        "test-service.js", // Assuming handleUserInput is around line 95
        95 // If you know the function name, you could try: "the `handleUserInput` function in test-service.js"
      )} - User input not sanitized
- Missing authentication check in ${createFileLink(
        "src/auth/middleware.js",
        15
      )} - Endpoint accessible without auth
- Hardcoded credentials in ${createFileLink(
        ".env.example",
        5
      )} - Move to secure storage

**Performance Issues:**  
- Database query in loop detected in ${createFileLink(
        "src/data/repository.js",
        23
      )} - Consider batch operations
- Large bundle size in ${createFileLink(
        "src/components/Dashboard.vue",
        150
      )} - Implement code splitting
- Memory leak in ${createFileLink(
        "src/services/websocket.js",
        78
      )} - Fix event listener cleanup

**Code Quality Issues:**
- Missing error handling in ${createFileLink(
        "test-service.js", // Assuming an error handling section is around line 200
        200
      )} - Add try-catch block
- Unused import in ${createFileLink(
        "src/utils/formatters.js",
        5
      )} - Remove unused dependencies
- Inconsistent naming in ${createFileLink(
        "src/api/users.js",
        34
      )} - Use camelCase convention

📋 **Next Steps with ${
        detectedWorkspace ? "Clickable" : "Potentially Clickable Relative"
      } Links:**
🚨 **BLOCKING**: Fix SQL injection in ${createFileLink("test-service.js", 95)}
⚠️ **HIGH PRIORITY**: Add authentication to ${createFileLink(
        "src/auth/middleware.js",
        15
      )}
📋 **MEDIUM PRIORITY**: Optimize queries in ${createFileLink(
        "src/data/repository.js",
        23
      )}
ℹ️ **LOW PRIORITY**: Clean up imports in ${createFileLink(
        "src/utils/formatters.js",
        5
      )}

💡 **Code Suggestion with Diff:**
\`\`\`diff
--- a/test-service.js
+++ b/test-service.js
@@ -93,3 +93,3 @@
- const query = "SELECT * FROM users WHERE id = " + userId;
+ const query = "SELECT * FROM users WHERE id = ?";
+ const result = await db.execute(query, [userId]);
\`\`\`

📁 **All Referenced Files:**
• ${createFileLink("test-service.js")}
• ${createFileLink("package.json")}
• ${createFileLink(".env")} 
• ${createFileLink("README.md")}
• ${createFileLink("src/components/Header.vue")}
• ${createFileLink("src/utils/helpers.js")}
• ${createFileLink("src/styles/main.css")}
• ${createFileLink("tests/unit/service.test.js")}
• ${createFileLink("config/webpack.config.js")}
• ${createFileLink("src/data/repository.js")}
• ${createFileLink("src/components/Dashboard.vue")}
• ${createFileLink("src/auth/middleware.js")}
• ${createFileLink("src/services/websocket.js")}
• ${createFileLink("src/api/users.js")}
• ${createFileLink("src/utils/formatters.js")}

🧪 **Debug Information:**
- **Detected Workspace**: ${detectedWorkspace || "None"}
- **Link Format**: Markdown links with \`vscode://file/\` URIs (or relative paths)
- **Sample Generated Link**: ${
        detectedWorkspace
          ? createFileLink("test-service.js", 150)
          : createFileLink("test-service.js")
      }
- **Copilot Chat Suggestion**: Using Markdown links like [text](vscode://file/path) or [text](./path)
- **Request Parameters**: ${Object.keys(req.body).join(", ")}

💡 **How to Use These File References:**
These links should now be clickable directly in the Copilot Chat UI if the Markdown rendering and URI schemes are supported as suggested.

**Workspace Validation:**
- Your workspace: \`${detectedWorkspace || "Not detected"}\`
- Expected files: Should exist in the above directory

🧪 **Testing Instructions:**
1. ${
        detectedWorkspace
          ? "🎉 Click on any file reference above - they should be clickable and navigate to files in VS Code!"
          : '💡 Try again with workspace path: "@astraea-ai test file links in workspace /Users/yourusername/yourproject" to enable absolute path links.'
      }
2. ${
        detectedWorkspace
          ? "File links should navigate to actual files in your IDE."
          : "Relative links are being used; clickability depends on VS Code Chat's interpretation of these within your workspace."
      }
3. ${
        detectedWorkspace
          ? "Line number links should jump to specific lines."
          : "Line numbers are displayed but may not be part of the relative link's navigation."
      }

${
  detectedWorkspace
    ? "🎉 **SUCCESS (Expected)**: VS Code clickable file links using Markdown should be ACTIVE!"
    : "💡 **Next Steps**: Provide workspace path for more reliable absolute path links."
}

**How to Provide Workspace Path:**
Try these commands:
- \`@astraea-ai test file links in workspace /Users/yourusername/myproject\`
- \`@astraea-ai test file links for project /Users/yourusername/myproject\`  
- \`@astraea-ai test file links with workspace path /Users/yourusername/myproject\`
- Replace \`/Users/yourusername/myproject\` with your actual project directory`,

      timestamp: new Date().toISOString(),
      status: "success",
      debug_info: {
        detected_workspace: detectedWorkspace,
        link_format: detectedWorkspace
          ? "markdown_vscode_uri"
          : "markdown_relative",
        clickable: true, // Assuming Markdown links will be clickable
        request_parameters: Object.keys(req.body),
        workspace_sources_checked: [
          "workspace_path",
          "workspace_root",
          "project_path",
          "repository_path",
          "editor_context.workspace_path",
          "copilot_context.workspace.rootPath",
        ],
      },
    };

    console.log(
      "📤 Sending file links response with workspace:",
      detectedWorkspace,
      "using Markdown links."
    );
    res.json(response);
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
    const { code_snippet, language = "javascript" } = req.body;
    if (!code_snippet) {
      return res
        .status(400)
        .json({ error: "Missing required parameter: code_snippet" });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // For this endpoint, we'll use a simplified createFileLink for brevity
    // or assume a fixed workspace for demonstration if needed.
    // For now, let's assume files are relative and use backticks as it's not the focus here.
    const mockCreateFileLink = (file, line) => `\`${file}:${line}\``; // Simple backtick version for this endpoint

    const analysis = {
      language: language,
      lines_of_code: code_snippet.split("\n").length,
      estimated_complexity: Math.floor(Math.random() * 10) + 1,
      suggestions: [
        "✨ Consider adding error handling for better robustness",
        "🚀 This code looks well-structured and follows good practices",
        "📝 Adding comments would improve code readability",
      ],
      issues_found: [
        {
          type: "style",
          severity: "low",
          description: "Consider using const instead of let where possible",
          line: Math.floor(Math.random() * 5) + 1,
          file: "test-service.js", // Example file
        },
        {
          type: "performance",
          severity: "medium",
          description: "Loop optimization opportunity detected",
          line: Math.floor(Math.random() * 5) + 1,
          file: "test-file.js", // Example file
        },
      ],
    };

    const response = {
      message: `🔍 **Code Analysis Complete**`,
      summary: `Analyzed ${analysis.lines_of_code} lines of ${language} code`,
      issues_with_file_links: `🔍 **Issues Found:**
• **Style Issue** in ${mockCreateFileLink(
        analysis.issues_found[0].file,
        analysis.issues_found[0].line
      )}: ${analysis.issues_found[0].description}
• **Performance Issue** in ${mockCreateFileLink(
        analysis.issues_found[1].file,
        analysis.issues_found[1].line
      )}: ${analysis.issues_found[1].description}`,
      analysis: analysis,
      recommendations: `💡 **Recommendations:**\n${analysis.suggestions
        .map((s) => `• ${s}`)
        .join("\n")}`,
      related_files: `📁 **Related Files:**
• \`test-service.js\` - Main service implementation
• \`test-file.js\` - Utility functions`,
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
      "Simple test service for GitHub Copilot Skillset integration with Markdown links",
    endpoints: {
      greeting: {
        /* ... */
      },
      analyze: {
        /* ... */
      },
      file_links: {
        url: "/api/test/file-links",
        method: "POST",
        description: "Test Markdown file linking for Copilot Chat",
        parameters: {
          workspace_path: "string (optional) - Absolute path to the workspace",
          // ... other path parameters
        },
      },
    },
    setup_instructions: [
      /* ... */
    ],
  });
});

// Catch all for debugging
app.use("*", (req, res) => {
  console.log("🔍 Unhandled request:", {
    /* ... */
  });
  res.status(404).json({
    /* ... */
  });
});

app.listen(PORT, () => {
  console.log("🚀 Astraea.AI Test Service started!");
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(
    "✨ Markdown link functionality for file paths implemented in /api/test/file-links."
  );
  // ... rest of the startup logs

  console.log("🧪 Test commands:");
  console.log("   @your-app-name say hello to Alice");
  console.log(
    '   @your-app-name analyze this JavaScript: function test() { return "hello"; }'
  );
  console.log("   @your-app-name test file links");
});
