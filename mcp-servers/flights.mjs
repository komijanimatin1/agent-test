import express from "express";
import { Router } from "express";
import { randomUUID } from "crypto";
import {
  McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { z } from "zod";
import axios from "axios";
import cors from "cors";
import { createPublicKey, createVerify, createHash } from "crypto";

// Configuration constants
const CONFIG = {
  PORT: 4000,
  ISSUER_URL: "https://dev.sso.arnacore.ir/realms/tccim",
  CLIENT_ID: "ai-spa",
  REDIRECT_URI: "http://localhost:4000/mcp",
  BASE_URL: "http://localhost:4000",
  DOCUMENTATION_URL: "https://docs.your-server.com/",
  FLIGHT_API_URL: "http://localhost:3001/flights",
  REQUIRED_SCOPES: ["openid", "profile", "email"],
};

// Helper function to decode base64url
const base64urlDecode = (str) => {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding to make length multiple of 4
  const padding = 4 - (str.length % 4);
  if (padding !== 4) {
    str += '='.repeat(padding);
  }
  return Buffer.from(str, 'base64').toString('utf-8');
};

// Helper function to get public key from JWKS
const getPublicKeyFromJwks = async (jwksUri, kid) => {
  const { data: jwks } = await axios.get(jwksUri);
  const key = jwks.keys.find(k => k.kid === kid);
  if (!key) {
    throw new Error("Signing key not found in JWKS");
  }
  return createPublicKey({ key, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
};

// Verify access token using Keycloak JWKS
const verifyAccessToken = async (token) => {
  try {
    const jwksUri = `${CONFIG.ISSUER_URL}/protocol/openid-connect/certs`;
    console.log("Verifying token with JWKS:", { token: token.substring(0, 10) + '...', jwksUri });

    const [headerB64, payloadB64, signatureB64] = token.split('.');
    const header = JSON.parse(base64urlDecode(headerB64));
    const payload = JSON.parse(base64urlDecode(payloadB64));

    // Debug: Log decoded parts to inspect
    console.log("Decoded header:", header);
    console.log("Decoded payload:", payload);

    if (!header.kid) {
      throw new Error("Invalid token: Missing kid in header");
    }

    const signingKey = await getPublicKeyFromJwks(jwksUri, header.kid);

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    const isValid = verifier.verify(signingKey, Buffer.from(signatureB64, 'base64'));

    if (!isValid) {
      throw new Error("Invalid token signature");
    }

    // Check expiration (fixed: don't throw if missing for dev, but warn; check if expired)
    if (!payload.exp) {
      console.warn("Token has no expiration time (ignoring for dev)");
    } else if (Date.now() / 1000 >= payload.exp) {
      throw new Error("Token is expired");
    } else {
      console.log("Token exp:", payload.exp);
    }

    // Fix: Parse scopes from payload (not hardcoded)
    const scopes = payload.scope ? payload.scope.split(' ') : [];
    console.log("Parsed scopes:", scopes);

    const missingScopes = CONFIG.REQUIRED_SCOPES.filter(s => !scopes.includes(s));
    if (missingScopes.length > 0) {
      throw new Error(`Missing required scopes: ${missingScopes.join(", ")}`);
    }

    console.log("Token verified:", { sub: payload.sub, scopes });
    return {
      token,
      clientId: payload.client_id || CONFIG.CLIENT_ID,
      scopes,
      claims: payload,
    };
  } catch (error) {
    console.error("Token verification error:", error.message);
    throw Object.assign(new Error(`Invalid token: ${error.message}`), { status: 401 });
  }
};
// Configure ProxyOAuthServerProvider
const proxyProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: `${CONFIG.ISSUER_URL}/protocol/openid-connect/auth?client_id=${CONFIG.CLIENT_ID}&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&response_type=code&scope=${CONFIG.REQUIRED_SCOPES.join("%20")}`,
    tokenUrl: `${CONFIG.ISSUER_URL}/protocol/openid-connect/token`,
    revocationUrl: `${CONFIG.ISSUER_URL}/protocol/openid-connect/revoke`,
  },
  verifyAccessToken,
  getClient: async (client_id) => ({
    client_id,
    redirect_uris: [CONFIG.REDIRECT_URI],
  }),
});

// Authentication middleware with error handling
const authMiddleware = (req, res, next) => {
  requireBearerAuth({
    requiredScopes: CONFIG.REQUIRED_SCOPES,
    resourceMetadataUrl: CONFIG.ISSUER_URL,
    verifier: { verifyAccessToken },
  })(req, res, (err) => {
    if (err) {
      console.error("Auth middleware error:", err.message);
      const status = err.status || (err.message.includes("Invalid token") ? 401 : 500);
      const errorResponse = {
        error: status === 401 ? "invalid_token" : "server_error",
        error_description: status === 401 ? err.message : "Internal Server Error",
      };
      return res.status(status).json(errorResponse);
    }
    next();
  });
};

// Initialize Express app and middleware
const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.NODE_ENV === "production" ? "https://your-production-domain.com" : "*",
  exposedHeaders: ["Mcp-Session-Id"],
  allowedHeaders: ["Content-Type", "mcp-session-id", "Authorization"],
}));

// Initialize MCP Server
const mcpServer = new McpServer({
  name: "Flight-MCP",
  version: "1.0.0",
});

// Register reserveFlight tool
mcpServer.registerTool(
  "reserveFlight",
  {
    description: "Reserve an existing flight in the database",
    inputSchema: z.object({
      flightId: z.string().describe("Unique flight ID for reservation (REQUIRED)"),
      confirm: z.boolean().optional().default(false).describe("User confirmation flag"),
    }),
  },
  async (input, context) => {
    if (!context?.auth?.claims?.sub) {
      throw new Error("Authentication required: Please login to use this tool.");
    }

    const userId = context.auth.claims.sub;
    console.log(`Authenticated user: ${userId}`);

    if (!input.confirm) {
      return {
        content: [
          {
            type: "text",
            text: `🛫 Flight selected: ${input.flightId}\n\nPlease confirm to reserve.`,
          },
        ],
        state: "pending-approval",
      };
    }

    try {
      const res = await axios.patch(
        `${CONFIG.FLIGHT_API_URL}/${encodeURIComponent(input.flightId)}`,
        { reserved: true },
        { headers: { "Content-Type": "application/json" } }
      );

      return {
        content: [
          {
            type: "text",
            text: `✅ Flight reserved successfully:\n${JSON.stringify(res.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to reserve flight: ${error.response?.data?.message || error.message || "Unknown error"}`
      );
    }
  }
);

// Session management
const transports = {};

// Handle MCP session requests (GET/DELETE)
const handleSessionRequest = async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
      return res.status(400).send("Invalid or missing session ID");
    }
    await transports[sessionId].handleRequest(req, res);
  } catch (error) {
    console.error(`MCP ${req.method} error:`, error.message);
    res.status(500).send(`Server error: ${error.message}`);
  }
};

// MCP Routes
const mcpRouter = Router();
mcpRouter.use(authMiddleware);

mcpRouter.post("/", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
          console.log(`New session initialized: ${newSessionId}`);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          console.log(`Session closed: ${transport.sessionId}`);
          delete transports[transport.sessionId];
        }
      };

      await mcpServer.connect(transport);
    } else {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: null,
      });
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP POST error:", error.message);
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: `Server error: ${error.message}` },
      id: null,
    });
  }
});

mcpRouter.get("/", handleSessionRequest);
mcpRouter.delete("/", handleSessionRequest);

// Mount routes
app.use("/mcp", mcpRouter);
app.use(mcpAuthRouter({
  provider: proxyProvider,
  issuerUrl: new URL(CONFIG.ISSUER_URL),
  baseUrl: new URL(CONFIG.BASE_URL),
  serviceDocumentationUrl: new URL(CONFIG.DOCUMENTATION_URL),
}));

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "MCP server is running" });
});

// Start the server
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 MCP server running on http://localhost:${CONFIG.PORT}`);
});