import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END, Annotation } from "@langchain/langgraph";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { z } from "zod";
import { createAgent } from "langchain";
import { runMediaAgent } from "../agents/media_agent.mjs";
import { runRAGAgent } from "../RAG/RAGServer.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, "..", ".env");
dotenv.config({ path: envPath });

if (!process.env.OPENROUTER_API_KEY) {
  console.error("❌ Missing OPENROUTER_API_KEY. Please create a .env file with your API key.");
  process.exit(1);
}

const llm = new ChatOpenAI({
  apiKey:
    "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",
  model: "google/gemini-2.5-flash-preview-09-2025",
  temperature: 0,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

// MongoDB setup
const MONGODB_URI = process.env.MONGODB_ATLAS_URI;
let mongoClient = null;
let checkpointWrites = null; // 👈 کالکشن جدید برای thread_name
if (MONGODB_URI) {
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db(process.env.MONGODB_DB_NAME || "langgraph_db");
  checkpointWrites = db.collection("checkpoint_writes");
  console.log("✅ Connected to MongoDB (checkpoint_writes)");
} else {
  console.log("⚠️ No MONGODB_URI found — will not check thread_name history");
}

// LangGraph checkpointer (دست نخورده)
let checkpointer = null;
if (MONGODB_URI) {
  const mongoCheckpointClient = new MongoClient(MONGODB_URI);
  await mongoCheckpointClient.connect();
  checkpointer = new MongoDBSaver({
    client: mongoCheckpointClient,
    dbName: process.env.MONGODB_DB_NAME || "langgraph_db",
    collectionName:
      process.env.MONGODB_CHECKPOINTS_COLLECTION || "langgraph_checkpoints",
  });
  console.log("✅ Initialized LangGraph checkpointer");
} else {
  console.warn("⚠️  No MONGODB_URI found — LangGraph checkpoints will not be persisted");
}

// تعریف State
const StateAnnotationFirstTime = Annotation.Root({
  input: Annotation(),
  route: Annotation(),
  output: Annotation(),
  thread_name: Annotation(),
  response_mode: Annotation(),
  userId: Annotation(),
  thread_id: Annotation(),
  res: Annotation(),
  existing: Annotation(),
});

const StateAnnotation = Annotation.Root({
  input: Annotation(),
  route: Annotation(),
  output: Annotation(),
  response_mode: Annotation(),
  userId: Annotation(),
  thread_id: Annotation(),
  res: Annotation(),
  existing: Annotation(),
});

// خروجی router
const routerOutputSchema = z.object({
  route: z.enum(["media", "casie", "rag"]),
  thread_name: z.string().optional(),
});

const routerAgent = createAgent({ llm, tools: [], checkpointer, responseFormat: routerOutputSchema });

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors());

// ساخت thread_id
function ensureThreadId(conversationId, sourcePrefix = "user") {
  if (conversationId && String(conversationId).trim()) return String(conversationId);
  return `${sourcePrefix}-${uuidv4()}`;
}

app.post("/chat-messages", async (req, res) => {
  const { query, response_mode, conversation_id, userId } = req.body;
  if (!query) return res.status(400).json({ error: "query is required" });

  const threadId = ensureThreadId(conversation_id, `thread-${userId}`);
  console.log("Thread ID:", threadId);

  // 🧠 چک thread_name از checkpoint_writes
  let existing = null;
  if (checkpointWrites) {
    existing = await checkpointWrites.findOne({
      thread_id: threadId,
      channel: "thread_name",
    });
    if (existing) console.log("✅ Found existing thread_name in checkpoint_writes");
  }

  // ساخت گراف
  const orchestratorGraph = new StateGraph(existing ? StateAnnotation : StateAnnotationFirstTime)
    .addNode("router", async (state) => {
      const { input, thread_id, userId, existing } = state;

      let decisionPrompt;
      if (existing) {
        decisionPrompt = `
User request: "${input}"

Analyze this request and decide which service should handle it: "media", "casie", or "rag".

Respond with a JSON object containing the "route".
`;
      } else {
        decisionPrompt = `
User request: "${input}"

Analyze this request and:
1. Decide which service should handle it: "media", "casie", or "rag".
2. Generate a concise 3-6 word title for this conversation. The current user is "${userId}".

Respond with a JSON object containing the "route" and the "thread_name".
`;
      }

      console.log(decisionPrompt);

      try {
        const agentResponse = await routerAgent.invoke(
          { messages: [{ role: "user", content: decisionPrompt }] },
          { configurable: { thread_id: thread_id } }
        );

        const { structuredResponse } = agentResponse;
        let { route, thread_name } = structuredResponse;

        if (!["media", "casie", "rag"].includes(route)) {
          route = "rag";
        }

        console.log("🧭 Router decision:", route, "| Thread Name:", thread_name);
        return { route, thread_name };
      } catch (error) {
        console.error("❌ Error invoking router agent:", error.message);
      }
    })
    .addNode("media", async (state) => {
      console.log("🎬 Routing to Media Agent...");
      const { input, userId, thread_id, response_mode, res } = state;
      const response = await runMediaAgent(input, userId, thread_id, response_mode, res);
      return { output: response };
    })
    .addNode("casie", async (state) => {
      console.log("⚖️ CASIE SERVICE");
      const decision = await llm.invoke([{ role: "user", content: state.input }]);
      return { output: decision.content || "Casie handled the request" };
    })
    .addNode("rag", async (state) => {
      console.log("🔍 RAG SERVICE");
      const { input, thread_id, response_mode, res } = state;
      const response = await runRAGAgent(input, 3, thread_id, response_mode, res);
      return { output: response };
    })
    .addConditionalEdges("router", (state) => state.route)
    .addEdge("media", END)
    .addEdge("casie", END)
    .addEdge("rag", END)
    .setEntryPoint("router");

  const graph = orchestratorGraph.compile({ checkpointer });

  const graphResult = await graph.invoke(
    { input: query, userId, thread_id: threadId, response_mode, res, existing },
    { configurable: { thread_id: threadId } }
  );

  if (!res.headersSent) {
    return res.json({
      reply: graphResult.output,
      thread_id: threadId,
      thread_name: graphResult.thread_name,
    });
  } else {
    console.log("⚠️ Response already sent by streaming mode.");
    return; // از تکرار پاسخ جلوگیری کن
  }
});

// GET /conversations?last_id=&limit=20
// Returns decoded `value` for all documents in `checkpoint_writes` where channel === 'thread_name'
app.get('/conversations', async (req, res) => {
  try {
    const last_id = req.query.last_id;
    const limit = parseInt(req.query.limit || '20', 10);

    if (!checkpointWrites) return res.status(500).json({ error: 'Database not configured' });

    // Fetch all documents where channel === 'thread_name'
    const query = { channel: 'thread_name' };
    if (last_id) {
      try {
        query._id = { $gt: new ObjectId(String(last_id)) };
      } catch (err) {
        return res.status(400).json({ error: 'invalid last_id' });
      }
    }

    const cursor = checkpointWrites.find(query).sort({ _id: 1 }).limit(Number(limit));
    const docs = await cursor.toArray();

    const items = docs.map((d) => {
      let decoded = null;
      try {
        // Handle different shapes for Binary/Buffer stored in `value`
        const raw = d.value;
        let buf = null;
        if (!raw) {
          buf = null;
        } else if (Buffer.isBuffer(raw)) {
          buf = raw;
        } else if (raw.buffer && Buffer.isBuffer(raw.buffer)) {
          // mongodb Binary -> { _bsontype: 'Binary', buffer: <Buffer ...> }
          buf = raw.buffer;
        } else if (typeof raw === 'string') {
          // sometimes value is stored as base64 string
          buf = Buffer.from(raw, 'base64');
        } else if (raw._bsontype === 'Binary' && raw.sub_type !== undefined && raw.buffer) {
          buf = raw.buffer;
        } else {
          // fallback: try to stringify
          decoded = raw;
        }

        if (buf) {
          const str = buf.toString('utf8');
          if (d.type === 'json') {
            try {
              decoded = JSON.parse(str);
            } catch (e) {
              decoded = str;
            }
          } else {
            decoded = str;
          }
        }
      } catch (err) {
        decoded = null;
      }

      return {
        _id: d._id,
        thread_id: d.thread_id,
        idx: d.idx,
        channel: d.channel,
        type: d.type,
        value: decoded,
      };
    });

    return res.json({ items });
  } catch (error) {
    console.error('Error in /conversations:', error);
    return res.status(500).json({ error: String(error) });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🧭 Orchestrator Express server running on http://localhost:${PORT}`);
  console.log(`🔁 POST /chat-messages`);
  console.log(`🔁 GET /conversations`);
});
