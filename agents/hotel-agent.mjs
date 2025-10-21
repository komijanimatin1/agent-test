import express from "express";
import { v4 as uuidv4 } from "uuid";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";

// --- Shared MongoClient for persistence ---
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

// --- MCP Tools (connect to hotel MCP server) ---
const mcpClient = new MultiServerMCPClient({
  "hotel-mcp": { url: "http://localhost:4002/mcp" },
});
const tools = await mcpClient.getTools();

// --- LLM Configuration ---
const llm = new ChatOpenAI({
  apiKey:
    "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",
  model: "openai/gpt-4o",
  temperature: 0,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

// --- AgentCard Definition ---
const hotelAgentCard = {
  name: "Hotel Agent",
  description: "An agent for handling hotel bookings and information.",
  protocolVersion: "0.3.0",
  version: "0.1.0",
  url: "http://localhost:5002/",
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

// --- Executor Implementation ---
class HotelExecutor {
  async execute(requestContext, eventBus) {
    try {
      console.log("🏨 [Executor] Incoming A2A Request:", requestContext);

      const userMessageContent =
        requestContext.initialMessage?.parts?.[0]?.text || "Default message";

      const checkpointer = await createCheckpointer();
      const agent = createReactAgent({ llm, tools, checkpointer });

      console.log("🔍 [Executor] Processing message:", userMessageContent);

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

      console.log("✅ [Executor] Final Reply:", finalReply);
      eventBus.publish(responseMessage);
      eventBus.finished();
    } catch (err) {
      console.error("❌ [Executor] Error:", err);
      eventBus.finished();
    }
  }

  async cancelTask() {
    console.log("🛑 [Executor] Task cancelled");
  }
}

// --- A2A Server Setup ---
const executor = new HotelExecutor();
const handler = new DefaultRequestHandler(
  hotelAgentCard,
  new InMemoryTaskStore(),
  executor
);

const appBuilder = new A2AExpressApp(handler);
const expressApp = appBuilder.setupRoutes(express());

expressApp.listen(5002, () => {
  console.log("🏨 Hotel A2A Agent Server running at http://localhost:5002");
});
