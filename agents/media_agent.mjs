import express from "express";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// MongoDB Connection
const mongoUri =
  "mongodb+srv://agent-test:agent-test1404@langchain.ebn5nxx.mongodb.net/?retryWrites=true&w=majority&appName=LangChain";
const mongoClient = new MongoClient(mongoUri);
await mongoClient.connect();

async function createCheckpointer() {
  return new MongoDBSaver({
    client: mongoClient,
    dbName: "langgraph_db",
    collectionName: "media_checkpoints",
  });
}

// MCP Tools - Connect to Media MCP Server
const mcpClient = new MultiServerMCPClient({
  "media-mcp": { url: "https://dev.media.arnacore.ir/api/mcp" },
});
const rawTools = await mcpClient.getTools();

// Convert MCP tools to proper LangChain tools
const tools = rawTools.map(rawTool => {
  const toolName = rawTool.name
    .toLowerCase()
    .replace(/\s+/g, '_')  // Replace spaces with underscores
    .replace(/[^a-zA-Z0-9_.-]/g, '');  // Remove invalid characters

  console.log(`🔧 Converting tool: ${rawTool.name} -> ${toolName}`);
  console.log(`📝 Tool schema:`, rawTool.inputSchema);

  // Create a simple schema for the tool
  const schema = z.object({});
  
  return new DynamicStructuredTool({
    name: toolName,
    description: rawTool.description || `Tool: ${rawTool.name}`,
    schema: schema,
    func: async (input) => {
      try {
        console.log(`🛠️  Executing tool: ${toolName} with input:`, input);
        const result = await rawTool.invoke(input);
        console.log(`✅ Tool result:`, result);
        return JSON.stringify(result);
      } catch (error) {
        console.error(`❌ Tool execution error:`, error);
        return `Error executing tool: ${error.message}`;
      }
    }
  });
});

console.log("🔧 [Media Agent] Loaded MCP tools:", tools.map(t => t.name));

// LLM Configuration
const llm = new ChatOpenAI({
  apiKey:
    "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",
  model: "openai/gpt-4o",
  temperature: 0,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

// Express App Setup
const app = express();
app.use(express.json());

// Chat Endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message, userId = "default-user" } = req.body;
    console.log("💬 [Media Agent] Received message:", message, "| User ID:", userId);
    console.log("🔧 [Media Agent] Available tools:", tools.map(t => ({ name: t.name, description: t.description })));

    const checkpointer = await createCheckpointer();
    const agent = createReactAgent({ llm, tools, checkpointer });

    console.log("🤖 [Media Agent] Invoking agent...");
    const response = await agent.invoke(
      { messages: [{ role: "user", content: message }] },
      { configurable: { thread_id: `media-${userId}` } }
    );

    console.log("📝 [Media Agent] Agent response:", JSON.stringify(response, null, 2));
    
    const lastMessage = response.messages?.at(-1);
    console.log("💭 [Media Agent] Last message:", JSON.stringify(lastMessage, null, 2));
    
    const finalReply = Array.isArray(lastMessage?.content)
      ? lastMessage.content.map((c) => c.text || "").join("")
      : lastMessage?.content || "No response";

    console.log("✅ [Media Agent] Sending reply:", finalReply);
    res.json({ reply: finalReply });
  } catch (error) {
    console.error("❌ [Media Agent] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ error: error.message });
  }
});

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "media-agent" });
});

const PORT = 5003;
app.listen(PORT, () => {
  console.log(`🎬 Media Agent Server running at http://localhost:${PORT}`);
  console.log(`💬 Chat endpoint: POST http://localhost:${PORT}/chat`);
  console.log(`🏥 Health check: GET http://localhost:${PORT}/health`);
});
