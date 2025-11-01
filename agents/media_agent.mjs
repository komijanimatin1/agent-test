import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { MongoDBChatMessageHistory } from "@langchain/mongodb";
import { randomUUID } from "crypto";


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


const structuredOutput = z.object({
  event: z.string(),
  task_id: z.string(),
  id: z.string(),
  message_id: z.string(),
  conversation_id: z.string(),
  mode: z.string(),
  answer: z.string(),
  metadata: z.object({
    usage: z.object({
      prompt_tokens: z.number(),
      prompt_unit_price: z.string(),
      prompt_price_unit: z.string(),
      prompt_price: z.string(),
      completion_tokens: z.number(),
      completion_unit_price: z.string(),
      completion_price_unit: z.string(),
      completion_price: z.string(),
      total_tokens: z.number(),
      total_price: z.string(),
      currency: z.string(),
      latency: z.number()
    }),
    retriever_resources: z.array(z.object({
      position: z.number(),
      dataset_id: z.string(),
      dataset_name: z.string(),
      document_id: z.string(),
      document_name: z.string(),
      segment_id: z.string(),
      score: z.number(),
      content: z.string()
    }))
  })
});

// تابع برای ذخیره پاسخ AI در MongoDB
async function saveAIMessage(threadId, content) {
  try {
    const chatCollection = mongoClient.db("langgraph_db").collection("message_store");
    const history = new MongoDBChatMessageHistory({
      collection: chatCollection,
      sessionId: threadId,
    });
    await history.addMessage(new AIMessage(content));
    console.log(`✅ [Media Agent] پاسخ AI ذخیره شد در thread: ${threadId}`);
  } catch (error) {
    console.error(`❌ [Media Agent] خطا در ذخیره پاسخ AI:`, error.message);
  }
}

export async function runMediaAgent(message, userId = "default-user", thread_id, response_mode, res) {
  const threadIdToUse = thread_id || `media-${userId}`;
  console.log("💬 [Media Agent] Received message:", message, "| User ID:", userId, "| Thread ID:", thread_id);
  console.log("🔧 [Media Agent] Available tools:", tools.map(t => ({ name: t.name, description: t.description })));

  if (response_mode === "streaming") {
    const mediaAgent = createReactAgent({ llm, tools, checkpointer });

    // Generate IDs and timestamp for streaming
    const messageId = randomUUID();
    const conversationId = threadIdToUse;
    const taskId = randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);

    // Ensure response headers are set for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    const startTime = Date.now();
    let fullAnswer = "";

    try {
      for await (const chunk of await mediaAgent.stream(
        { messages: [new HumanMessage(message)] },
        { configurable: { thread_id: threadIdToUse }, streamMode: "messages" }
      )) {
        const content = Array.isArray(chunk) ? (chunk[0]?.content || "") : (chunk.content || "");
        console.log("🔍 Streaming chunk:", content);
        if (content) {
          fullAnswer += content;
          // Stream each chunk as JSON
          const streamData = {
            event: "message",
            message_id: messageId,
            conversation_id: conversationId,
            answer: content,
            created_at: createdAt
          };
          res.write(`data: ${JSON.stringify(streamData)}\n\n`);
        }
      }

      // Calculate latency and prepare metadata
      const latency = (Date.now() - startTime) / 1000;
      
      // Send message_end event
      const messageEndData = {
        event: "message_end",
        id: taskId,
        conversation_id: conversationId,
        metadata: {
          usage: {
            prompt_tokens: 0, // Will be populated by LLM if available
            prompt_unit_price: "0.001",
            prompt_price_unit: "0.001",
            prompt_price: "0",
            completion_tokens: 0,
            completion_unit_price: "0.002",
            completion_price_unit: "0.001",
            completion_price: "0",
            total_tokens: 0,
            total_price: "0",
            currency: "USD",
            latency: latency
          },
          retriever_resources: []
        }
      };
      
      res.write(`data: ${JSON.stringify(messageEndData)}\n\n`);
      res.end();
      
      // Save full answer to MongoDB
      await saveAIMessage(threadIdToUse, fullAnswer);
      
      return null;
    } catch (e) {
      console.error('❌ [Media Agent] streaming error:', e);
      res.write(`data: ${JSON.stringify({ event: "error", error: e.message })}\n\n`);
      res.end();
      return `Error: ${e.message}`;
    }
  } else {
    console.log("🤖 [Media Agent] Invoking agent...");
    const mediaAgent = createReactAgent({ llm, tools, checkpointer, responseFormat: structuredOutput });

    const response = await mediaAgent.invoke(
      {
        messages: [new HumanMessage(message)],
      },
      { configurable: { thread_id: threadIdToUse } }
    );


    console.log("✅ [Media Agent] Sending reply:", response.structuredResponse);

    // ذخیره پاسخ AI در MongoDB (فقط وقتی جواب کامل است)
    await saveAIMessage(threadIdToUse, response.structuredResponse);

    return response.structuredResponse;
  }
}

export { tools };