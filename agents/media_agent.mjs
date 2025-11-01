import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";


// MongoDB Connection
const mongoUri =
  "mongodb+srv://agent-test:agent-test1404@langchain.ebn5nxx.mongodb.net/?retryWrites=true&w=majority&appName=LangChain";
const mongoClient = new MongoClient(mongoUri);
await mongoClient.connect();

async function createCheckpointer() {
  return new MongoDBSaver({
    client: mongoClient,
    dbName: "langgraph_db"
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

// Create checkpointer for memory
const checkpointer = await createCheckpointer();

// LLM Configuration
const llm = new ChatOpenAI({
  apiKey:
    "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",
  model: "google/gemini-2.5-flash",
  temperature: 0,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

const mediaAgent = createReactAgent({ llm, tools, checkpointer });

export async function runMediaAgent(message, userId = "default-user", thread_id, response_mode, res) {
  const threadIdToUse = thread_id || `media-${userId}`;
  console.log("💬 [Media Agent] Received message:", message, "| User ID:", userId, "| Thread ID:", thread_id);
  console.log("🔧 [Media Agent] Available tools:", tools.map(t => ({ name: t.name, description: t.description })));

  if (response_mode === "streaming") {
    // Ensure response headers are set for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    try {
      for await (const chunk of await mediaAgent.stream(
        { messages: [{ role: 'user', content: message }] },
        { configurable: { thread_id: threadIdToUse }, streamMode: "messages" }
      )) {
        const content = Array.isArray(chunk) ? (chunk[0]?.content || "") : (chunk.content || "");
        console.log("Streaming chunk:", content);
        if (content) {
          res.write(content);
        }
      }
      res.write('event: done\ndata: [DONE]\n\n');
      res.end();
      return null;
    } catch (e) {
      console.error('❌ [Media Agent] streaming error:', e);
      res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
      return `Error: ${e.message}`;
    }
  } else {
    console.log("🤖 [Media Agent] Invoking agent...");
    const response = await mediaAgent.invoke(
      {
        messages: [{ role: "user", content: message }],
      },
      { configurable: { thread_id: threadIdToUse } }
    );

    console.log("📝 [Media Agent] Agent response:", JSON.stringify(response, null, 2));

    const lastMessage = response.messages?.at(-1);
    console.log("💭 [Media Agent] Last message:", JSON.stringify(lastMessage, null, 2));

    const finalReply = Array.isArray(lastMessage?.content)
      ? lastMessage.content.map((c) => c.text || "").join("")
      : lastMessage?.content || "No response";

    console.log("✅ [Media Agent] Sending reply:", finalReply);
    return finalReply;
  }
}

export { mediaAgent, tools };