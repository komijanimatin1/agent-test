// Unified A2A Router Server
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";

// Mongo setup
const mongoClient = new MongoClient("mongodb+srv://agent-test:agent-test1404@langchain.ebn5nxx.mongodb.net/");
await mongoClient.connect();

async function createCheckpointer() {
  return new MongoDBSaver({
    client: mongoClient,
    dbName: "langgraph_db",
    collectionName: "checkpoints",
  });
}

// LLM shared
const llm = new ChatOpenAI({
  apiKey: "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",
  model: "openai/gpt-4o-mini",
  temperature: 0,
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
});

// --- Agents Setup ---
const flightTools = await new MultiServerMCPClient({
  "flight-mcp": { url: "http://localhost:4001/mcp" },
}).getTools();

const hotelTools = await new MultiServerMCPClient({
  "hotel-mcp": { url: "http://localhost:4002/mcp" },
}).getTools();

// --- Router Executor ---
class RouterExecutor {
  async execute(requestContext, eventBus) {
    const text = requestContext.userMessage?.parts?.[0]?.text || "";
    console.log("🎯 Router received:", text);

    // مرحله ۱: تصمیم‌گیری به کمک LLM
    const decisionPrompt = `
You are a routing assistant.
Decide which agent should handle this user request:
"book me a flight to Paris" → flight
"find a hotel in Rome" → hotel
"both" if it's mixed.

User message:
"${text}"

Respond with only one word: "flight" or "hotel".
    `;

    const routerDecision = await llm.invoke([{ role: "user", content: decisionPrompt }]);
    const decision = routerDecision.content[0].text?.trim().toLowerCase();
    console.log("🧭 Router decision:", decision);

    // مرحله ۲: اجرای ایجنت انتخاب‌شده
    const checkpointer = await createCheckpointer();
    let agent, chosenTools;

    if (decision.includes("hotel")) {
      chosenTools = hotelTools;
      console.log("🏨 Using hotel agent");
    } else {
      chosenTools = flightTools;
      console.log("🛫 Using flight agent");
    }

    agent = createReactAgent({ llm, tools: chosenTools, checkpointer });

    const response = await agent.invoke(
      { messages: [{ role: "user", content: text }] },
      { configurable: { thread_id: requestContext.contextId } }
    );

    const lastMessage = response.messages?.at(-1);
    const finalReply =
      Array.isArray(lastMessage?.content)
        ? lastMessage.content.map((c) => c.text || "").join("")
        : lastMessage?.content || "No response";

    const responseMessage = {
      kind: "message",
      messageId: uuidv4(),
      role: "agent",
      parts: [{ kind: "text", text: finalReply }],
      contextId: requestContext.contextId,
    };

    eventBus.publish(responseMessage);
    eventBus.finished();
  }
}

// AgentCard اصلی برای Router
const routerAgentCard = {
  name: "Travel Router Agent",
  description: "Routes user requests to Flight or Hotel agents automatically.",
  protocolVersion: "0.3.0",
  version: "1.0.0",
  url: "http://localhost:5000/a2a/",
  capabilities: {
    pushNotifications: false,
    streamingResponses: true,
  },
};

const routerHandler = new DefaultRequestHandler(
  routerAgentCard,
  new InMemoryTaskStore(),
  new RouterExecutor()
);

const routerAppBuilder = new A2AExpressApp(routerHandler);
const routerExpressApp = routerAppBuilder.setupRoutes(express());

const app = express();
app.use("/a2a", routerExpressApp);

app.listen(5000, () => {
  console.log("🧠 Unified A2A Router running at http://localhost:5000/a2a/");
});
