import express from "express";
import { v4 as uuidv4 } from "uuid";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { A2AClient } from "@a2a-js/sdk/client"; // corrected import
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import { DynamicTool } from "@langchain/core/tools"; // for defining custom tools

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

// Define custom tools that call the other A2A agents
const flightTool = new DynamicTool({
  name: "flight_agent",
  description: "Delegate flight-related tasks to the Flight Agent. Input should be a id of the flight so u should use get fflight tool in this agent afterward give the id to flight agent.",
  func: async (input) => {
    if (!input || input.trim() === "") {
      return "No specific flight details provided. Please clarify.";
    }
    const client = await A2AClient.fromCardUrl("http://localhost:5001/.well-known/agent-card.json");
    const messageParams = {
      message: {
        kind: "message",
        messageId: uuidv4(),
        role: "user",
        parts: [{ kind: "text", text: input }],
      },
      configuration: {
        blocking: true,
        acceptedOutputModes: ["text/plain"],
      },
    };
    const response = await client.sendMessage(messageParams);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.result?.status?.message?.parts[0]?.text || "No response from Flight Agent";
  },
});

const hotelTool = new DynamicTool({
  name: "hotel_agent",
  description: "Delegate hotel-related tasks to the Hotel Agent. Input should be a id of the hotel so u should use get hotel tool in this agent afterward give the id to hotel agent.",
  func: async (input) => {
    if (!input || input.trim() === "") {
      return "No specific hotel details provided. Please clarify.";
    }
    const client = await A2AClient.fromCardUrl("http://localhost:5002/.well-known/agent-card.json");
    const messageParams = {
      message: {
        kind: "message",
        messageId: uuidv4(),
        role: "user",
        parts: [{ kind: "text", text: input }],
      },
      configuration: {
        blocking: true,
        acceptedOutputModes: ["text/plain"],
      },
    };
    const response = await client.sendMessage(messageParams);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.result?.status?.message?.parts[0]?.text || "No response from Hotel Agent";
  },
});

const tools = [flightTool, hotelTool];

// LLM
const llm = new ChatOpenAI({
  apiKey:
    "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",
  model: "openai/gpt-4o",
  temperature: 0.2, // Slightly increased for better tool usage
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

// AgentCard for Travel Agent
const travelAgentCard = {
  name: "Travel Agent",
  description: "An agent for handling travel plans, including flights and hotels.",
  protocolVersion: "0.3.0",
  version: "0.1.0",
  url: "http://localhost:5000/",
  skills: [
    {
      id: "travel",
      name: "Travel Operations",
      description: "Handle travel-related tasks like booking flights and hotels.",
      tags: ["travel", "booking", "flight", "hotel"],
    },
  ],
  capabilities: {
    pushNotifications: false,
    streamingResponses: true,
  },
};

// --- Executor Implementation ---
class TravelExecutor {
  async execute(requestContext, eventBus) {
    try {
      console.log("✈️🏨 [Executor] Incoming A2A Request:", requestContext);

      let userMessageContent =
        requestContext.userMessage?.parts[0]?.text || "Default message";

      console.log("📩 [Executor] User Message Content:", userMessageContent); // Log the incoming message for debugging

      // Enhanced prompt to ensure tool calls with complete inputs
      const enhancedPrompt = `
You are a travel agent that must use tools to book flights and hotels. Do not respond without using the tools.
For any request, break it down:
1. Use flight_agent for flight bookings with full details (e.g., origin, destination, date).
2. Use hotel_agent for hotel bookings with full details (e.g., location, type, date).
Assume defaults if missing: origin=London, date=next week (e.g., October 25, 2025), duration=1 night.
Always provide Action Input as a complete query sentence.
Question: ${userMessageContent}
`;

      const checkpointer = await createCheckpointer();
      const agent = createReactAgent({ llm, tools, checkpointer, });

      const response = await agent.invoke(
        { messages: [{ role: "user", content: userMessageContent }] },
        { configurable: { thread_id: requestContext.contextId } }
      );

      console.log("🤖 [Executor] Full Agent Response:", response); // Log full response for debugging

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
      // Publish an error response
      const errorReply = `An error occurred: ${err.message}. Please provide more details.`;
      const responseMessage = {
        kind: "message",
        messageId: uuidv4(),
        role: "agent",
        parts: [{ kind: "text", text: errorReply }],
        contextId: requestContext.contextId,
      };
      eventBus.publish(responseMessage);
      eventBus.finished();
    }
  }

  async cancelTask() {
    console.log("🛑 [Executor] Task cancelled");
  }
}

// --- A2A Server Setup ---
const executor = new TravelExecutor();
const handler = new DefaultRequestHandler(
  travelAgentCard,
  new InMemoryTaskStore(),
  executor
);

const appBuilder = new A2AExpressApp(handler);
const expressApp = appBuilder.setupRoutes(express());

expressApp.listen(5000, () => {
  console.log("🌍 Travel A2A Agent Server running at http://localhost:5000");
});