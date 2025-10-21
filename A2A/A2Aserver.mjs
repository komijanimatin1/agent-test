// Combined A2A Server for Flight and Hotel Agents
// This server runs on port 5000 and mounts the flight agent at /flight and hotel at /hotel
// Update agent card URLs accordingly: http://localhost:5000/flight/ and http://localhost:5000/hotel/

import express from "express";
import { v4 as uuidv4 } from "uuid";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";

// Shared MongoClient for persistence
const mongoUri =
  "mongodb+srv://agent-test:agent-test1404@langchain.ebn5nxx.mongodb.net/?retryWrites=true&w=majority&appName=LangChain";
const mongoClient = new MongoClient(mongoUri);
await mongoClient.connect();

async function createCheckpointer() {
  return new MongoDBSaver({
    client: mongoClient,
    dbName: "langgraph_db",
    collectionName: "checkpoints",
  });
}

// --- LLM Configuration (shared) ---
const llm = new ChatOpenAI({
  apiKey:
    "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",
  model: "openai/gpt-4o",
  temperature: 0,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

// --- Flight Agent Setup ---
const flightMcpClient = new MultiServerMCPClient({
  "flight-mcp": { url: "http://localhost:4001/mcp" },
});
const flightTools = await flightMcpClient.getTools();

const flightAgentCard = {
  name: "Flight Agent",
  description: "An agent for handling flight bookings and information.",
  protocolVersion: "0.3.0",
  version: "0.1.0",
  url: "http://localhost:5000/flight/",
  skills: [
    {
      id: "flight",
      name: "Flight Operations",
      description: "Handle flight-related tasks",
      tags: ["flight", "booking"],
    },
  ],
  capabilities: {
    pushNotifications: false,
    streamingResponses: true,
  },
};

class FlightExecutor {
  async execute(requestContext, eventBus) {
    try {
      console.log("🛫 [Flight Executor] Incoming A2A Request:", requestContext);

      const userMessageContent =
        requestContext.userMessage?.parts?.[0]?.text || "Default message";

      const checkpointer = await createCheckpointer();
      const agent = createReactAgent({ llm, tools: flightTools, checkpointer });

      console.log(requestContext,userMessageContent)
      const response = await agent.invoke(
        { messages: [{ role: "user", content: userMessageContent }] },
        { configurable: { thread_id: requestContext.contextId } }
      );

      const lastMessage = response.messages?.at(-1);
      const finalReply = Array.isArray(lastMessage?.content)
        ? lastMessage.content.map((c) => c.text || "").join("")
        : lastMessage?.content || "No response";

      const responseMessage = {
        kind: "message",
        messageId: uuidv4(),
        role: "agent",
        parts: [{ kind: "text", text: finalReply }],
        contextId: requestContext.contextId,
      };

      console.log("✅ [Flight Executor] Final Reply:", finalReply);
      eventBus.publish(responseMessage);
      eventBus.finished();
    } catch (err) {
      console.error("❌ [Flight Executor] Error:", err);
      eventBus.finished();
    }
  }

  async cancelTask() {
    console.log("🛑 [Flight Executor] Task cancelled");
  }
}

const flightExecutor = new FlightExecutor();
const flightHandler = new DefaultRequestHandler(
  flightAgentCard,
  new InMemoryTaskStore(),
  flightExecutor
);

const flightAppBuilder = new A2AExpressApp(flightHandler);
const flightExpressApp = flightAppBuilder.setupRoutes(express());

// --- Hotel Agent Setup ---
const hotelMcpClient = new MultiServerMCPClient({
  "hotel-mcp": { url: "http://localhost:4002/mcp" },
});
const hotelTools = await hotelMcpClient.getTools();

const hotelAgentCard = {
  name: "Hotel Agent",
  description: "An agent for handling hotel bookings and information.",
  protocolVersion: "0.3.0",
  version: "0.1.0",
  url: "http://localhost:5000/hotel/",
  skills: [
    {
      id: "hotel",
      name: "Hotel Operations",
      description: "Handle hotel-related tasks like booking and availability.",
      tags: ["hotel", "booking"],
    },
  ],
  capabilities: {
    pushNotifications: false,
    streamingResponses: true,
  },
};

class HotelExecutor {
  async execute(requestContext, eventBus) {
    try {
      console.log("🏨 [Hotel Executor] Incoming A2A Request:", requestContext);

      const userMessageContent =
        requestContext.userMessage?.parts?.[0]?.text || "Default message";

      const checkpointer = await createCheckpointer();
      const agent = createReactAgent({ llm, tools: hotelTools, checkpointer });

      const response = await agent.invoke(
        { messages: [{ role: "user", content: userMessageContent }] },
        { configurable: { thread_id: requestContext.contextId } }
      );

      const lastMessage = response.messages?.at(-1);
      const finalReply = Array.isArray(lastMessage?.content)
        ? lastMessage.content.map((c) => c.text || "").join("")
        : lastMessage?.content || "No response";

      const responseMessage = {
        kind: "message",
        messageId: uuidv4(),
        role: "agent",
        parts: [{ kind: "text", text: finalReply }],
        contextId: requestContext.contextId,
      };

      console.log("✅ [Hotel Executor] Final Reply:", finalReply);
      eventBus.publish(responseMessage);
      eventBus.finished();
    } catch (err) {
      console.error("❌ [Hotel Executor] Error:", err);
      eventBus.finished();
    }
  }

  async cancelTask() {
    console.log("🛑 [Hotel Executor] Task cancelled");
  }
}

const hotelExecutor = new HotelExecutor();
const hotelHandler = new DefaultRequestHandler(
  hotelAgentCard,
  new InMemoryTaskStore(),
  hotelExecutor
);

const hotelAppBuilder = new A2AExpressApp(hotelHandler);
const hotelExpressApp = hotelAppBuilder.setupRoutes(express());

// --- Combined Server ---
const app = express();

app.use('/flight', flightExpressApp);
app.use('/hotel', hotelExpressApp);

app.listen(5000, () => {
  console.log("Combined A2A Agent Server running at http://localhost:5000");
  console.log("Flight Agent: http://localhost:5000/flight/");
  console.log("Hotel Agent: http://localhost:5000/hotel/");
});