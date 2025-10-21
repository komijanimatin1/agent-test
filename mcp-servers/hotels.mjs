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
  PORT: 4002,
  HOTEL_API_URL: "http://localhost:3001/hotels",
  BASE_URL: "http://localhost:4002",
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
  name: "Hotel-MCP-NoAuth",
  version: "1.0.0",
});

// Handler functions for each tool

// Tool 1: Get Hotels - لیست تمام هتل‌ها
async function handleGetHotels(args) {
  try {
    console.log("🔍 Fetching all hotels...", args.query ? `Query: ${args.query}` : "");
    
    const response = await axios.get(CONFIG.HOTEL_API_URL);
    const hotels = response.data;

    // آماده کردن دیتا برای مدل
    const hotelSummary = `📋 **Available Hotels Database**\n\nTotal hotels: ${hotels.length}\n\n` +
      `Full hotel data for AI analysis:\n${JSON.stringify(hotels, null, 2)}`;

    return {
      content: [
        {
          type: "text",
          text: hotelSummary,
        },
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch hotels: ${error.response?.data?.message || error.message || "Unknown error"}`
    );
  }
}

// Tool 2: Reserve Hotel - رزرو هتل با id
async function handleReserveHotel(args) {
  if (args.confirm !== true) {
    return {
      content: [
        {
          type: "text",
          text: `🏨 **Hotel Selected for Reservation**\n\nHotel ID: ${args.hotelId}\n\n⚠️ Please confirm to proceed with the reservation.\nSet 'confirm' to true to complete the booking.`,
        },
      ],
    };
  }

  try {
    console.log(`🏨 Reserving hotel: ${args.hotelId}`);
    
    // ابتدا هتل را بگیریم تا اطلاعاتش را نشان دهیم
    const getResponse = await axios.get(`${CONFIG.HOTEL_API_URL}/${encodeURIComponent(args.hotelId)}`);
    const hotel = getResponse.data;

    // چک کنیم که قبلاً رزرو نشده باشد
    if (hotel.reserved) {
      return {
        content: [
          {
            type: "text",
            text: `❌ **Reservation Failed**\n\nHotel ${args.hotelId} is already reserved.\n\nHotel Details:\n${JSON.stringify(hotel, null, 2)}`,
          },
        ],
      };
    }

    // رزرو کنیم
    const reserveResponse = await axios.patch(
      `${CONFIG.HOTEL_API_URL}/${encodeURIComponent(args.hotelId)}`,
      { reserved: true },
      { headers: { "Content-Type": "application/json" } }
    );

    return {
      content: [
        {
          type: "text",
          text: `✅ **Hotel Reserved Successfully!**\n\n🏨 Reservation Details:\n\nName: ${hotel.name}\nLocation: ${hotel.location}\nPrice per Night: $${hotel.price_per_night}\nStars: ${hotel.stars}\nHas Pool: ${hotel.has_pool ? "Yes" : "No"}\nHas WiFi: ${hotel.has_wifi ? "Yes" : "No"}\nHas Gym: ${hotel.has_gym ? "Yes" : "No"}\nRoom Type: ${hotel.room_type}\nCheck-in: ${hotel.check_in}\nCheck-out: ${hotel.check_out}\nAvailable Rooms: ${hotel.available_rooms}\n\n📋 Full Details:\n${JSON.stringify(reserveResponse.data, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to reserve hotel: ${error.response?.data?.message || error.message || "Unknown error"}`
    );
  }
}

// Tool 3: Suggest Hotels - پیشنهاد هتل‌ها بر اساس لیست id ها
async function handleSuggestHotels(args) {
  try {
    console.log(`🎯 Fetching suggested hotels:`, args.hotelIds);

    if (!args.hotelIds || args.hotelIds.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "⚠️ No hotel IDs provided. Please provide at least one hotel ID.",
          },
        ],
      };
    }

    // بگیریم تمام هتل‌ها
    const allHotelsResponse = await axios.get(CONFIG.HOTEL_API_URL);
    const allHotels = allHotelsResponse.data;

    // فیلتر کنیم فقط هتل‌هایی که در لیست id ها هستند
    const suggestedHotels = allHotels.filter(hotel => 
      args.hotelIds.includes(hotel.id)
    );

    if (suggestedHotels.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `❌ No hotels found matching the provided IDs: ${args.hotelIds.join(", ")}`,
          },
        ],
      };
    }

    // آماده کردن خلاصه برای نمایش
    const hotelsSummary = suggestedHotels.map((hotel, index) => {
      return `\n**${index + 1}. ${hotel.name}** (${hotel.stars} stars)
  Location: ${hotel.location}
  Price per Night: $${hotel.price_per_night}
  Amenities: Pool - ${hotel.has_pool ? "Yes" : "No"}, WiFi - ${hotel.has_wifi ? "Yes" : "No"}, Gym - ${hotel.has_gym ? "Yes" : "No"}
  Room Type: ${hotel.room_type}
  Check-in: ${hotel.check_in} | Check-out: ${hotel.check_out}
  Available Rooms: ${hotel.available_rooms}
  Status: ${hotel.reserved ? "🔴 Reserved" : "🟢 Available"}
  ID: ${hotel.id}`;
    }).join("\n");

    const result = `🏨 **Suggested Hotels** (${suggestedHotels.length} of ${args.hotelIds.length} requested)\n${hotelsSummary}\n\n📋 **Full Hotel Data:**\n${JSON.stringify(suggestedHotels, null, 2)}`;

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
      `Failed to fetch suggested hotels: ${error.response?.data?.message || error.message || "Unknown error"}`
    );
  }
}

// Register tools with McpServer
mcpServer.registerTool(
  "get-hotels",
  {
    title: "Get Hotels",
    description: "Get all available hotels from the database. Returns complete hotel information including names, locations, prices, amenities, and availability.",
    inputSchema: {
      query: z.string().optional().describe("Optional search query from user to help filter results")
    }
  },
  handleGetHotels
);

mcpServer.registerTool(
  "reserve-hotel",
  {
    title: "Reserve Hotel",
    description: "Reserve a specific hotel by its ID. Updates the hotel's reservation status to true.",
    inputSchema: {
      hotelId: z.string().describe("The unique ID of the hotel to reserve (REQUIRED)"),
      confirm: z.boolean().optional().describe("Confirmation flag - set to true to confirm reservation")
    }
  },
  handleReserveHotel
);

mcpServer.registerTool(
  "suggest-hotels",
  {
    title: "Suggest Hotels",
    description: "Get specific hotels by their IDs. Useful for suggesting or comparing multiple hotels based on a list of hotel IDs.",
    inputSchema: {
      hotelIds: z.array(z.string()).describe("Array of hotel IDs to retrieve")
    }
  },
  handleSuggestHotels
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
    status: "MCP Hotel Server (No Auth) is running",
    version: "1.0.0",
    tools: [
      "get-hotels - Get all available hotels",
      "reserve-hotel - Reserve a hotel by ID",
      "suggest-hotels - Get specific hotels by IDs"
    ],
    endpoint: `${CONFIG.BASE_URL}/mcp`
  });
});

// Start the server
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 MCP Hotel Server (No Auth) running on http://localhost:${CONFIG.PORT}`);
  console.log(`📡 MCP Endpoint: http://localhost:${CONFIG.PORT}/mcp`);
  console.log(`\n🛠️  Available Tools:`);
  console.log(`   1. get-hotels - Get all available hotels`);
  console.log(`   2. reserve-hotel - Reserve a hotel by ID`);
  console.log(`   3. suggest-hotels - Get specific hotels by IDs`);
});