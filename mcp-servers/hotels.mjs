import {
    McpServer,
    ResourceTemplate,
  } from "@modelcontextprotocol/sdk/server/mcp.js";
  import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
  import axios from "axios";
  import { z } from "zod";
  import dotenv from "dotenv";
  import fs from "fs";
  import path from "path";
  dotenv.config();
  
  
  // MCP Server
  const server = new McpServer({
    name: "Hotels-MCP",
    version: "1.0.0",
  });
  
  // Helper function to read database via API
  async function readDatabase() {
    try {
      const response = await axios.get('http://localhost:3001/db');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to read database: ${error.message}`);
    }
  }
  
  // Helper function to update hotel via API
  async function updateHotel(hotelId, updatedHotel) {
    try {
      const response = await axios.patch(`http://localhost:3001/hotels/${hotelId}`, updatedHotel);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to update hotel: ${error.message}`);
    }
  }
  
  // Zod schemas
  const ReserveHotelSchema = z.object({
    hotelId: z.number().int().positive("Hotel ID must be a positive integer"),
    action: z.enum(["reserve", "cancel"], {
      errorMap: () => ({ message: "Action must be either 'reserve' or 'cancel'" })
    })
  });
  
  const HotelDetailsSchema = z.object({
    id: z.number().int().positive(),
    name: z.string().min(1, "Hotel name cannot be empty"),
    location: z.string().min(1, "Location cannot be empty"),
    price: z.number().positive("Price must be positive"),
    reserved: z.boolean()
  });
  
  // reserve hotel
  server.registerTool({
    name: "reserve-hotel",
    description: "Reserve or cancel a hotel reservation",
    inputSchema: ReserveHotelSchema
  }, async (args) => {
    // Validate input with Zod
    const validationResult = ReserveHotelSchema.safeParse(args);
    if (!validationResult.success) {
      return {
        content: [{
          type: "text",
          text: `Validation error: ${validationResult.error.errors.map(e => e.message).join(", ")}`
        }]
      };
    }
    
    const { hotelId, action } = validationResult.data;
    try {
      // Get current hotel data
      const response = await axios.get(`http://localhost:3001/hotels/${hotelId}`);
      const hotel = response.data;
      
      if (!hotel) {
        return {
          content: [{
            type: "text",
            text: `Hotel with ID ${hotelId} not found.`
          }]
        };
      }
      
      if (action === "reserve") {
        if (hotel.reserved) {
          return {
            content: [{
              type: "text",
              text: `Hotel ${hotel.name} in ${hotel.location} is already reserved.`
            }]
          };
        }
        hotel.reserved = true;
      } else if (action === "cancel") {
        if (!hotel.reserved) {
          return {
            content: [{
              type: "text",
              text: `Hotel ${hotel.name} in ${hotel.location} is not currently reserved.`
            }]
          };
        }
        hotel.reserved = false;
      }
      
      // Update hotel via API
      await updateHotel(hotelId, hotel);
      
      return {
        content: [{
          type: "text",
          text: `Hotel ${hotel.name} in ${hotel.location} has been ${action === "reserve" ? "reserved" : "cancelled"}. Price: $${hotel.price}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }]
      };
    }
  });
  
  // hotel details resource
  server.registerResource({
    uriTemplate: "hotels://details/{hotelId}",
    name: "Hotel Details",
    description: "Get detailed information about a specific hotel"
  }, async (uri) => {
    try {
      const hotelIdStr = uri.pathname.split('/').pop();
      const hotelId = parseInt(hotelIdStr);
      
      // Validate hotel ID
      if (isNaN(hotelId) || hotelId <= 0) {
        return {
          contents: [{
            uri: uri.toString(),
            mimeType: "text/plain",
            text: `Invalid hotel ID: ${hotelIdStr}. Must be a positive integer.`
          }]
        };
      }
      
      // Get hotel data via API
      const response = await axios.get(`http://localhost:3001/hotels/${hotelId}`);
      const hotel = response.data;
      
      if (!hotel) {
        return {
          contents: [{
            uri: uri.toString(),
            mimeType: "text/plain",
            text: `Hotel with ID ${hotelId} not found.`
          }]
        };
      }
      
      // Validate hotel data with Zod schema
      const hotelValidation = HotelDetailsSchema.safeParse(hotel);
      if (!hotelValidation.success) {
        return {
          contents: [{
            uri: uri.toString(),
            mimeType: "text/plain",
            text: `Hotel data validation error: ${hotelValidation.error.errors.map(e => e.message).join(", ")}`
          }]
        };
      }
      
      const details = {
        id: hotel.id,
        name: hotel.name,
        location: hotel.location,
        price: hotel.price,
        reserved: hotel.reserved,
        status: hotel.reserved ? "Reserved" : "Available"
      };
      
      return {
        contents: [{
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(details, null, 2)
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: uri.toString(),
          mimeType: "text/plain",
          text: `Error: ${error.message}`
        }]
      };
    }
  });
  
  // Server connection
  const transport = new StdioServerTransport();
  await server.connect(transport);
  