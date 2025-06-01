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
  return next();

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
    body: req.body,
  });

  // For testing, allow requests without signature
  if (!signature) {
    console.log("⚠️  No signature provided - allowing for testing");
    console.log("🔍 All headers:", req.headers);
    return next(); // Remove this line for production
  }

  const payload = JSON.stringify(req.body);

  // Handle both sha1 and sha256 signatures
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
    // If no prefix, assume it's just the hash and try both
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
    // Ensure both signatures have the same length for timingSafeEqual
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

// NEW: File links testing endpoint
app.post("/api/test/file-links", verifyGitHubSignature, async (req, res) => {
  try {
    console.log("🔗 File links endpoint called with:", req.body);

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 500));

    const response = {
      message: "🔗 **File Link Testing Results**",
      summary:
        "Testing GitHub Copilot file linking functionality with various file reference formats",

      basic_file_links: `📁 **Basic File Links:**
• \`test-service.js\` - Main service file
• \`test-file.js\` - Test utility file
• \`package.json\` - Dependencies configuration
• \`README.md\` - Documentation file`,

      file_links_with_lines: `📍 **File Links with Line Numbers:**
• \`test-service.js:1\` - File header
• \`test-service.js:25\` - Middleware setup
• \`test-service.js:150\` - File links endpoint  
• \`test-file.js:10\` - Helper function
• \`test-file.js:25-30\` - Error handling block`,

      directory_structure: `📂 **Directory Structure:**
• \`src/components/Header.vue\` - Header component
• \`src/utils/helpers.js:45\` - Utility functions
• \`src/styles/main.css:12-20\` - Main stylesheet
• \`tests/unit/service.test.js:67\` - Unit tests
• \`config/webpack.config.js:89\` - Build configuration`,

      code_review_example: `🔍 **Mock Code Review with File Links:**

**Security Issues:**
- SQL injection vulnerability found in \`test-service.js:95\` - User input not sanitized
- Missing authentication check in \`test-file.js:15\` - Endpoint accessible without auth

**Performance Issues:**  
- Database query in loop detected in \`src/data/repository.js:23-35\` - Consider batch operations
- Large bundle size in \`src/components/Dashboard.vue:150\` - Implement code splitting

**Code Quality Issues:**
- Missing error handling in \`test-service.js:200\` - Add try-catch block
- Unused import in \`test-file.js:5\` - Remove unused dependencies
- Inconsistent naming in \`src/utils/formatters.js:12\` - Use camelCase convention`,

      next_steps: `📋 **Next Steps with File References:**
🚨 **BLOCKING**: Fix SQL injection in \`test-service.js:95\`
⚠️ **HIGH PRIORITY**: Add authentication to \`test-file.js:15\`  
📋 **MEDIUM PRIORITY**: Optimize queries in \`src/data/repository.js:23-35\`
ℹ️ **LOW PRIORITY**: Clean up imports in \`test-file.js:5\``,

      diff_example: `💡 **Code Suggestion with Diff:**
\`\`\`diff
--- a/test-service.js
+++ b/test-service.js
@@ -93,3 +93,3 @@
- const query = "SELECT * FROM users WHERE id = " + userId;
+ const query = "SELECT * FROM users WHERE id = ?";
+ const result = await db.execute(query, [userId]);
\`\`\``,

      files_summary: `📁 **All Referenced Files:**
• \`test-service.js\`
• \`test-file.js\`  
• \`package.json\`
• \`README.md\`
• \`src/components/Header.vue\`
• \`src/utils/helpers.js\`
• \`src/styles/main.css\`
• \`tests/unit/service.test.js\`
• \`config/webpack.config.js\`
• \`src/data/repository.js\`
• \`src/components/Dashboard.vue\`
• \`src/utils/formatters.js\``,

      test_instructions: `🧪 **Testing Instructions:**
1. Click on any file reference above (they should be clickable in Copilot Chat)
2. File links should navigate to the actual files in your IDE
3. Line number links should jump to specific lines
4. Line range links should highlight the specified range

**Expected Behavior:**
- \`test-service.js:150\` should open this file and jump to line 150
- \`test-file.js:25-30\` should open the file and highlight lines 25-30
- Files without line numbers should just open the file`,

      timestamp: new Date().toISOString(),
      received_data: req.body,
      status: "success",
    };

    console.log("📤 Sending file links response");
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

    // Simulate some processing time
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

    // Simulate analysis processing time
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock analysis results with file links
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
          file: "test-service.js",
        },
        {
          type: "performance",
          severity: "medium",
          description: "Loop optimization opportunity detected",
          line: Math.floor(Math.random() * 5) + 1,
          file: "test-file.js",
        },
      ],
    };

    const response = {
      message: `🔍 **Code Analysis Complete**`,
      summary: `Analyzed ${analysis.lines_of_code} lines of ${language} code`,

      issues_with_file_links: `🔍 **Issues Found:**
• **Style Issue** in \`${analysis.issues_found[0].file}:${analysis.issues_found[0].line}\`: ${analysis.issues_found[0].description}
• **Performance Issue** in \`${analysis.issues_found[1].file}:${analysis.issues_found[1].line}\`: ${analysis.issues_found[1].description}`,

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

// Health check endpoint
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

// Root endpoint with service info
app.get("/", (req, res) => {
  console.log("🏠 Root endpoint accessed");
  res.json({
    service: "Astraea.AI Test Service",
    version: "1.0.0",
    description: "Simple test service for GitHub Copilot Skillset integration",
    endpoints: {
      greeting: {
        url: "/api/test/greeting",
        method: "POST",
        description: "Simple greeting endpoint for testing",
        parameters: {
          name: "string (optional) - Name to greet",
        },
      },
      analyze: {
        url: "/api/test/analyze",
        method: "POST",
        description: "Mock code analysis endpoint",
        parameters: {
          code_snippet: "string (required) - Code to analyze",
          language: "string (optional) - Programming language",
        },
      },
      file_links: {
        url: "/api/test/file-links",
        method: "POST",
        description: "Test file linking functionality for Copilot Chat",
        parameters: {
          any: "object - any parameters (for testing)",
        },
      },
    },
    setup_instructions: [
      "1. Start this service: node test-service.js",
      "2. Expose with ngrok: ngrok http 3000",
      "3. Configure GitHub App skillset with the ngrok URLs",
      "4. Test with: @your-app-name say hello to John",
      '5. Test with: @your-app-name analyze this code: console.log("test")',
      "6. Test file links with: @your-app-name test file links",
    ],
  });
});

// Catch all for debugging
app.use("*", (req, res) => {
  console.log("🔍 Unhandled request:", {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
  });
  res.status(404).json({
    error: "Endpoint not found",
    available_endpoints: [
      "GET /",
      "GET /health",
      "POST /api/test/greeting",
      "POST /api/test/analyze",
      "POST /api/test/file-links",
    ],
  });
});

app.listen(PORT, () => {
  console.log("🚀 Astraea.AI Test Service started!");
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log("");
  console.log("📋 Next steps:");
  console.log("1. Run: ngrok http 3000");
  console.log("2. Copy the https://xyz.ngrok.io URL");
  console.log("3. Configure your GitHub App skillset with these endpoints:");
  console.log("   - https://your-ngrok-url.ngrok.io/api/test/greeting");
  console.log("   - https://your-ngrok-url.ngrok.io/api/test/analyze");
  console.log("   - https://your-ngrok-url.ngrok.io/api/test/file-links");
  console.log("");
  console.log("🧪 Test commands:");
  console.log("   @your-app-name say hello to Alice");
  console.log(
    '   @your-app-name analyze this JavaScript: function test() { return "hello"; }'
  );
  console.log("   @your-app-name test file links");
});
