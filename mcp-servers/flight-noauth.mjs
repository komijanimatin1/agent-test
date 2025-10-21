import express from "express";
import { Router } from "express";
import { randomUUID } from "crypto";
import {
  McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import cors from "cors";
import { z } from "zod";

// Configuration constants
const CONFIG = {
  PORT: 4001,
  FLIGHT_API_URL: "http://localhost:3001/flights",
  BASE_URL: "http://localhost:4001",
};

// Initialize Express app and middleware
const app = express();
app.use(express.json());
app.use(cors({
  origin: "*",
  exposedHeaders: ["Mcp-Session-Id"],
  allowedHeaders: ["Content-Type", "mcp-session-id"],
}));

// Initialize MCP Server
const mcpServer = new McpServer({
  name: "Flight-MCP-NoAuth",
  version: "1.0.0",
});

// Handler functions for each tool

// Tool 1: Get Flights - لیست تمام پروازها
async function handleGetFlights(args) {
  try {
    console.log("🔍 Fetching all flights...", args.query ? `Query: ${args.query}` : "");
    
    const response = await axios.get(CONFIG.FLIGHT_API_URL);
    const flights = response.data;

    // آماده کردن دیتا برای مدل
    const flightSummary = `📋 **Available Flights Database**\n\nTotal flights: ${flights.length}\n\n` +
      `Full flight data for AI analysis:\n${JSON.stringify(flights, null, 2)}`;

    return {
      content: [
        {
          type: "text",
          text: flightSummary,
        },
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch flights: ${error.response?.data?.message || error.message || "Unknown error"}`
    );
  }
}

// Tool 2: Reserve Flight - رزرو پرواز با id
async function handleReserveFlight(args) {
  if (args.confirm !== true) {
    return {
      content: [
        {
          type: "text",
          text: `🛫 **Flight Selected for Reservation**\n\nFlight ID: ${args.flightId}\n\n⚠️ Please confirm to proceed with the reservation.\nSet 'confirm' to true to complete the booking.`,
        },
      ],
    };
  }

  try {
    console.log(`✈️ Reserving flight: ${args.flightId}`);
    
    // ابتدا پرواز را بگیریم تا اطلاعاتش را نشان دهیم
    const getResponse = await axios.get(`${CONFIG.FLIGHT_API_URL}/${encodeURIComponent(args.flightId)}`);
    const flight = getResponse.data;

    // چک کنیم که قبلاً رزرو نشده باشد
    if (flight.reserved) {
      return {
        content: [
          {
            type: "text",
            text: `❌ **Reservation Failed**\n\nFlight ${args.flightId} is already reserved.\n\nFlight Details:\n${JSON.stringify(flight, null, 2)}`,
          },
        ],
      };
    }

    // رزرو کنیم
    const reserveResponse = await axios.patch(
      `${CONFIG.FLIGHT_API_URL}/${encodeURIComponent(args.flightId)}`,
      { reserved: true },
      { headers: { "Content-Type": "application/json" } }
    );

    return {
      content: [
        {
          type: "text",
          text: `✅ **Flight Reserved Successfully!**\n\n🎫 Reservation Details:\n\nFlight: ${flight.from} ✈️ ${flight.to}\nFlight Number: ${flight.flight_number}\nAirline: ${flight.airline}\nDate: ${flight.date}\nDeparture: ${flight.departure_time}\nArrival: ${flight.arrival_time}\nDuration: ${flight.duration}\n\nPricing:\n- Economy: $${flight.price.economy}\n- Business: $${flight.price.business}\n\nSeats Remaining: ${flight.seats_remaining}\n\n📋 Full Details:\n${JSON.stringify(reserveResponse.data, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to reserve flight: ${error.response?.data?.message || error.message || "Unknown error"}`
    );
  }
}

// Tool 3: Suggest Flights - پیشنهاد پروازها بر اساس لیست id ها
async function handleSuggestFlights(args) {
  try {
    console.log(`🎯 Fetching suggested flights:`, args.flightIds);

    if (!args.flightIds || args.flightIds.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "⚠️ No flight IDs provided. Please provide at least one flight ID.",
          },
        ],
      };
    }

    // بگیریم تمام پروازها
    const allFlightsResponse = await axios.get(CONFIG.FLIGHT_API_URL);
    const allFlights = allFlightsResponse.data;

    // فیلتر کنیم فقط پروازهایی که در لیست id ها هستند
    const suggestedFlights = allFlights.filter(flight => 
      args.flightIds.includes(flight.id)
    );

    if (suggestedFlights.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `❌ No flights found matching the provided IDs: ${args.flightIds.join(", ")}`,
          },
        ],
      };
    }

    // آماده کردن خلاصه برای نمایش
    const flightsSummary = suggestedFlights.map((flight, index) => {
      return `\n**${index + 1}. Flight ${flight.flight_number}** (${flight.airline})
  Route: ${flight.from} (${flight.from_airport}) → ${flight.to} (${flight.to_airport})
  Date: ${flight.date} | Departure: ${flight.departure_time} | Arrival: ${flight.arrival_time}
  Duration: ${flight.duration}
  Price: Economy $${flight.price.economy} | Business $${flight.price.business}
  Seats: ${flight.seats_remaining} remaining
  Status: ${flight.reserved ? "🔴 Reserved" : "🟢 Available"}
  ID: ${flight.id}`;
    }).join("\n");

    const result = `✈️ **Suggested Flights** (${suggestedFlights.length} of ${args.flightIds.length} requested)\n${flightsSummary}\n\n📋 **Full Flight Data:**\n${JSON.stringify(suggestedFlights, null, 2)}`;

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch suggested flights: ${error.response?.data?.message || error.message || "Unknown error"}`
    );
  }
}

// Register tools with McpServer
mcpServer.registerTool(
  "get-flights",
  {
    title: "Get Flights",
    description: "Get all available flights from the database. Returns complete flight information including routes, prices, schedules, and availability.",
    inputSchema: {
      query: z.string().optional().describe("Optional search query from user to help filter results")
    }
  },
  handleGetFlights
);

mcpServer.registerTool(
  "reserve-flight",
  {
    title: "Reserve Flight",
    description: "Reserve a specific flight by its ID. Updates the flight's reservation status to true.",
    inputSchema: {
      flightId: z.string().describe("The unique ID of the flight to reserve (REQUIRED)"),
      confirm: z.boolean().optional().describe("Confirmation flag - set to true to confirm reservation")
    }
  },
  handleReserveFlight
);

mcpServer.registerTool(
  "suggest-flights",
  {
    title: "Suggest Flights",
    description: "Get specific flights by their IDs. Useful for suggesting or comparing multiple flights based on a list of flight IDs.",
    inputSchema: {
      flightIds: z.array(z.string()).describe("Array of flight IDs to retrieve")
    }
  },
  handleSuggestFlights
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

// MCP Routes (بدون authentication)
const mcpRouter = Router();

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
          console.log(`✅ New session initialized: ${newSessionId}`);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          console.log(`🔌 Session closed: ${transport.sessionId}`);
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

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "MCP Flight Server (No Auth) is running",
    version: "1.0.0",
    tools: [
      "get-flights - Get all available flights",
      "reserve-flight - Reserve a flight by ID",
      "suggest-flights - Get specific flights by IDs"
    ],
    endpoint: `${CONFIG.BASE_URL}/mcp`
  });
});

// Start the server
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 MCP Flight Server (No Auth) running on http://localhost:${CONFIG.PORT}`);
  console.log(`📡 MCP Endpoint: http://localhost:${CONFIG.PORT}/mcp`);
  console.log(`\n🛠️  Available Tools:`);
  console.log(`   1. get-flights - Get all available flights`);
  console.log(`   2. reserve-flight - Reserve a flight by ID`);
  console.log(`   3. suggest-flights - Get specific flights by IDs`);
});

// server.js (یا server.ts اگر TypeScript داری)

