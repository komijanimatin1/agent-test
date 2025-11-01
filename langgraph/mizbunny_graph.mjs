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
import { MongoDBChatMessageHistory } from "@langchain/mongodb";
import { HumanMessage} from "@langchain/core/messages";

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
let db = null; // made top-level so endpoints can reuse the DB reference
let checkpointWrites = null; // 👈 کالکشن جدید برای thread_name
if (MONGODB_URI) {
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  db = mongoClient.db(process.env.MONGODB_DB_NAME || "langgraph_db");
  checkpointWrites = db.collection("checkpoint_writes");
  console.log("✅ Connected to MongoDB (checkpoint_writes)");
} else {
  console.log("⚠️ No MONGODB_URI found — will not check thread_name history");
}

// LangGraph checkpointer (دست نخورده)
let checkpointer = null;
let mongoCheckpointClient = null;
let checkpointsCollection = null;
if (MONGODB_URI) {
  mongoCheckpointClient = new MongoClient(MONGODB_URI);
  await mongoCheckpointClient.connect();
  const checkpointDb = mongoCheckpointClient.db(process.env.MONGODB_DB_NAME || "langgraph_db");
  checkpointsCollection = checkpointDb.collection(
    process.env.MONGODB_CHECKPOINTS_COLLECTION || "checkpoints"
  );
  checkpointer = new MongoDBSaver({
    client: mongoCheckpointClient,
    dbName: process.env.MONGODB_DB_NAME || "langgraph_db",
    collectionName:
      process.env.MONGODB_CHECKPOINTS_COLLECTION || "checkpoints",
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

// تنظیمات اتصال به MongoDB برای Chat History
const chatConnectionString = "mongodb+srv://agent-test:agent-test1404@langchain.ebn5nxx.mongodb.net/?retryWrites=true&w=majority&appName=LangChain";
const chatDatabaseName = "langgraph_db";
const chatCollectionName = "message_store";

// MongoDB client برای Chat History
let chatHistoryClient = null;
let chatHistoryCollection = null;

// اتصال به MongoDB برای Chat History
if (chatConnectionString) {
  chatHistoryClient = new MongoClient(chatConnectionString);
  await chatHistoryClient.connect();
  const chatHistoryDb = chatHistoryClient.db(chatDatabaseName);
  chatHistoryCollection = chatHistoryDb.collection(chatCollectionName);
  console.log("✅ Connected to MongoDB for Chat History");
} else {
  console.warn("⚠️ No chat connection string found — Chat History will not work");
}

// تابع برای گرفتن یا ساختن history برای یک thread
function getChatHistory(threadId) {
  if (!chatHistoryCollection) {
    throw new Error("Chat History collection is not initialized. Check MongoDB connection.");
  }
  return new MongoDBChatMessageHistory({
    collection: chatHistoryCollection,
    sessionId: threadId, // این threadId شماست
  });
}

// تابع برای اضافه کردن پیام کاربر
async function addUserMessage(threadId, content) {
  const history = await getChatHistory(threadId);
  await history.addMessage(new HumanMessage(content));
  console.log(`✅ پیام کاربر ذخیره شد: ${content}`);
}

// تابع برای اضافه کردن پاسخ مدل
// async function addAIMessage(threadId, content) {
//   const history = getChatHistory(threadId);
//   await history.addMessage(new AIMessage(content));
//   console.log(`✅ پاسخ AI ذخیره شد: ${content}`);
// }

// تابع برای گرفتن تمام پیام‌های thread
async function getThreadMessages(threadId) {
  const history = await getChatHistory(threadId);
  const messages = await history.getMessages();
  return messages;
}

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

  // ذخیره پیام کاربر در MongoDB
  try {
    await addUserMessage(threadId, query);
  } catch (error) {
    console.error("❌ خطا در ذخیره پیام کاربر:", error.message);
    // ادامه می‌دهیم حتی اگر ذخیره نشد
  }

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
    // return res.json({
    //   replay:graphResult.output,
    //   thread_id: threadId,
    //   thread_name: graphResult.thread_name,
    // });
    return res.json({
      replay:graphResult.output,
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
app.get('/get-all-conversations', async (req, res) => {
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

/**
 * GET /messages
 * Query params:
 * - conversation_id (required) - thread ID برای دریافت پیام‌ها
 * 
 * Behavior:
 * - از MongoDBChatMessageHistory استفاده می‌کند برای دریافت پیام‌های thread
 * - پیام‌ها را به صورت آرایه برمی‌گرداند
 */
app.get("/get-conversation-messages", async (req, res) => {
  try {
    const conversation_id = req.query.conversation_id ? String(req.query.conversation_id) : undefined;

    if (!conversation_id) {
      return res.status(400).json({
        error: "Provide conversation_id query parameter. Example: /messages?conversation_id=thread-abc",
      });
    }

    // استفاده از تابع getThreadMessages که از MongoDBChatMessageHistory استفاده می‌کند
    const messages = await getThreadMessages(conversation_id);

   
    return res.json({ messages });
  } catch (error) {
    console.error("Error in /messages:", error);
    return res.status(500).json({ error: String(error) });
  }
});

/**
 * DELETE /conversations/:conversation_id
 * Path param:
 * - conversation_id (required) - thread ID for the conversation to delete
 * 
 * Behavior:
 * - Deletes from message_store where sessionId === conversation_id (one document)
 * - Deletes from checkpoint_writes where thread_id === conversation_id (multiple documents)
 * - Deletes from checkpoints where thread_id === conversation_id (multiple documents)
 */
app.delete("/delete-conversation/:conversation_id", async (req, res) => {
  try {
    // Get conversation_id from path parameter
    const thread_id = req.params.conversation_id;
    
    if (!thread_id) {
      return res.status(400).json({
        error: "Provide conversation_id in path. Example: DELETE /conversations/thread-abc",
      });
    }

    const threadIdString = String(thread_id);
    const deletionResults = {
      message_store: { deleted: 0 },
      checkpoint_writes: { deleted: 0 },
      checkpoints: { deleted: 0 },
    };

    // Delete from message_store (where sessionId === thread_id)
    if (chatHistoryCollection) {
      const messageResult = await chatHistoryCollection.deleteOne({
        sessionId: threadIdString,
      });
      deletionResults.message_store.deleted = messageResult.deletedCount;
      console.log(`✅ Deleted ${messageResult.deletedCount} document(s) from message_store`);
    } else {
      console.warn("⚠️ message_store collection not available");
    }

    // Delete from checkpoint_writes (where thread_id === thread_id)
    if (checkpointWrites) {
      const checkpointWritesResult = await checkpointWrites.deleteMany({
        thread_id: threadIdString,
      });
      deletionResults.checkpoint_writes.deleted = checkpointWritesResult.deletedCount;
      console.log(`✅ Deleted ${checkpointWritesResult.deletedCount} document(s) from checkpoint_writes`);
    } else {
      console.warn("⚠️ checkpoint_writes collection not available");
    }

    // Delete from checkpoints (LangGraph checkpoints collection)
    if (checkpointsCollection) {
      const checkpointsResult = await checkpointsCollection.deleteMany({
        thread_id: threadIdString,
      });
      deletionResults.checkpoints.deleted = checkpointsResult.deletedCount;
      console.log(`✅ Deleted ${checkpointsResult.deletedCount} document(s) from checkpoints`);
    } else {
      console.warn("⚠️ checkpoints collection not available");
    }

    const totalDeleted = 
      deletionResults.message_store.deleted +
      deletionResults.checkpoint_writes.deleted +
      deletionResults.checkpoints.deleted;

    if (totalDeleted === 0) {
      return res.status(404).json({
        message: "No documents found with the provided thread_id",
        thread_id: threadIdString,
        deletionResults,
      });
    }

    return res.json({
      message: "Conversation deleted successfully",
      thread_id: threadIdString,
      deletionResults,
      totalDeleted,
    });
  } catch (error) {
    console.error("❌ Error in /delete-conversation:", error);
    return res.status(500).json({ error: String(error) });
  }
});

/**
 * PATCH /edit-conversation-name
 * Body params:
 * - conversation_id (required) - thread_id for the conversation to edit
 * - thread_name (required) - new name for the conversation
 * 
 * Behavior:
 * - Updates the conversation name in checkpoint_writes where thread_id === conversation_id and channel === 'thread_name'
 * - Saves the name as base64-encoded string
 */
app.patch("/edit-conversation-name", async (req, res) => {
  try {
    const { conversation_id, thread_name } = req.query;

    if (!conversation_id) {
      return res.status(400).json({
        error: "Provide conversation_id in query. Example: PATCH /edit-conversation-name?conversation_id=thread-abc",
      });
    }

    if (!thread_name) {
      return res.status(400).json({
        error: "Provide thread_name in query. Example: PATCH /edit-conversation-name?thread_name=New Conversation Name",
      });
    }

    if (!checkpointWrites) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Encode the thread_name as base64
    const encodedName = Buffer.from(thread_name, 'utf8').toString('base64');

    // Find and update the document
    const updateResult = await checkpointWrites.updateOne(
      {
        thread_id: String(conversation_id),
        channel: 'thread_name'
      },
      {
        $set: {
          value: encodedName,
          type: 'string'
        }
      }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({
        error: "Conversation not found with the provided conversation_id",
        conversation_id: String(conversation_id),
      });
    }

    return res.json({
      message: "Conversation name updated successfully",
      conversation_id: String(conversation_id),
      thread_name: thread_name,
    });
  } catch (error) {
    console.error("❌ Error in /edit-conversation-name:", error);
    return res.status(500).json({ error: String(error) });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🧭 Orchestrator Express server running on http://localhost:${PORT}`);
  console.log(`🔁 POST /chat-messages`);
  console.log(`🔁 GET /get-all-conversations`);
  console.log(`🔁 GET /get-conversation-messages?conversation_id=thread-abc`);
  console.log(`🔁 DELETE /conversations/:conversation_id`);
  console.log(`🔁 PATCH /edit-conversation-name`);
});