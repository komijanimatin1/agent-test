import express from "express";
import { v4 as uuidv4 } from "uuid";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";

// Shared MongoClient for efficiency
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

// MCP Tools
const mcpClient = new MultiServerMCPClient({
  "flight-mcp": { url: "http://localhost:4001/mcp" },
});
const tools = await mcpClient.getTools();

// LLM
const llm = new ChatOpenAI({
  apiKey:
    "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",
  model: "openai/gpt-4o",
  temperature: 0,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

// AgentCard
const flightAgentCard = {
  name: "Flight Agent",
  description: "An agent for handling flight bookings and information.",
  protocolVersion: "0.3.0",
  version: "0.1.0",
  url: "http://localhost:5001/",
  skills: [
    {
      id: "flight",
      name: "Flight Operations",
      description: "Handle flight-related tasks",
      tags: ["flight", "booking"],
    },
  ],
  capabilities: {
    // even if you don't use them, define them explicitly
    pushNotifications: false,
    streamingResponses: true,
  },
};

// --- Executor Implementation ---
class FlightExecutor {
  async execute(requestContext, eventBus) {
    try {
      console.log("🛫 [Executor] Incoming A2A Request:", requestContext);

      const userMessageContent =
        requestContext.initialMessage?.parts?.[0]?.text || "Default message";

      const checkpointer = await createCheckpointer();
      const agent = createReactAgent({ llm, tools, checkpointer });

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
const executor = new FlightExecutor();
const handler = new DefaultRequestHandler(
  flightAgentCard,
  new InMemoryTaskStore(),
  executor
);

const appBuilder = new A2AExpressApp(handler);
const expressApp = appBuilder.setupRoutes(express());

// Add a simple /chat endpoint for direct communication
expressApp.use(express.json());
expressApp.post("/chat", async (req, res) => {
  try {
    const { message, userId = "default-user" } = req.body;
    console.log("💬 [Chat] Received message:", message, "| User ID:", userId);

    const checkpointer = await createCheckpointer();
    const agent = createReactAgent({ llm, tools, checkpointer });

    const response = await agent.invoke(
      { messages: [{ role: "user", content: message }] },
      { configurable: { thread_id: `flight-${userId}` } }
    );

    const lastMessage = response.messages?.at(-1);
    const finalReply = Array.isArray(lastMessage?.content)
      ? lastMessage.content.map((c) => c.text || "").join("")
      : lastMessage?.content || "No response";

    console.log("✅ [Chat] Sending reply:", finalReply);
    res.json({ reply: finalReply });
  } catch (error) {
    console.error("❌ [Chat] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

expressApp.listen(5001, () => {
  console.log("🚀 Flight A2A Agent Server running at http://localhost:5001");
  console.log("💬 Simple chat endpoint: POST http://localhost:5001/chat");
});
