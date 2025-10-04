import {
    McpServer,
    ResourceTemplate,
  } from "@modelcontextprotocol/sdk/server/mcp.js";
  import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
  import axios from "axios";
  import { z } from "zod";  
  
  // MCP Server
  const server = new McpServer({
    name: "Tour-MCP",
    version: "1.0.0",
  });
  
  // Tools
  // Tool: Reserve Tour
  server.registerTool(
    "reserveTour",
    {
      description: "Reserve an existing tour in the database",
      inputSchema: {
        tourId: z
          .string()
          .describe("ID یا اسم یکتای تور برای رزرو. (REQUIRED)"),
        confirm: z
          .boolean()
          .optional()
          .default(false)
          .describe("User confirmation flag (Don't set it true at first)."),
      },
    },
    async (input) => {
      if (!input.confirm) {
        return {
          content: [
            {
              type: "text",
              text: `🗺️ تور انتخاب شد: ${input.tourId}\n\nبرای رزرو تایید کنید.`,
            },
          ],
          state: "pending-approval",
        };
      }
  
      try {
        const res = await axios.patch(
          `http://localhost:3001/tours/${encodeURIComponent(input.tourId)}`,
          { reserved: true },
          {
            headers: { "Content-Type": "application/json" },
          }
        );
  
        return {
          content: [
            {
              type: "text",
              text: `✅ Tour reserved successfully:\n${JSON.stringify(
                res.data,
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to reserve tour: ${
            error.response?.data?.message || error.message || "Unknown error"
          }`
        );
      }
    }
  );
  
  
  // Resources
  // Resource: Tours by destination (dynamic)
  server.registerResource(
    "tours",
    new ResourceTemplate("tours://{destination}", { list: undefined }),
    {
      title: "Tours by destination",
      description: "List of tours to a specific destination",
      mimeType: "application/json",
    },
    async (uri, { destination }) => {
      try {
        const res = await axios.get("http://localhost:3001/tours");
        let tours = res.data;
  
        if (destination) {
          tours = tours.filter(
            (t) => String(t.destination).toLowerCase().includes(String(destination).toLowerCase())
          );
        }
  
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(tours, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to fetch tours: ${
            error.response?.data?.message || error.message || "Unknown error"
          }`
        );
      }
    }
  );
  
  // Server connection
  const transport = new StdioServerTransport();
  await server.connect(transport);
  