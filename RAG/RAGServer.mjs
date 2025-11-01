// RAGServer.mjs
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"; // Correct import
import { JinaEmbeddings } from "@langchain/community/embeddings/jina";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { MongoClient } from "mongodb";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Get the current file directory and resolve to project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load environment variables from project root
dotenv.config({ path: join(rootDir, '.env') });

// Verify API key is loaded
if (!process.env.JINA_API_KEY) {
    console.error("Error: JINA_API_KEY not found in environment variables");
    process.exit(1);
}

// Verify MongoDB connection details
if (!process.env.MONGODB_ATLAS_URI || !process.env.MONGODB_ATLAS_DB_NAME || !process.env.MONGODB_ATLAS_COLLECTION_NAME) {
    console.error("Error: MongoDB configuration not found in environment variables");
    process.exit(1);
}

// Initialize the LLM
const systemMessage = new SystemMessage("As a dedicated RAG assistant, I seamlessly blend top results from a vector database to provide insightful answers to your questions regarding the text. My goal is to offer clarity, precision, and valuable information tailored to your needs. ");
const llm = new ChatOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY || "",
    model: "openai/gpt-4.1",
    temperature: 0,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  });

// Initialize the embedding model
// Using the text-based model instead of the default jina-clip-v2
const embeddings = new JinaEmbeddings({
    apiKey: process.env.JINA_API_KEY,
    model: "jina-embeddings-v3", // Correct model name - text-based model
    dimensions: 1024, // Match the vector index dimensions
});

// Initialize MongoDB client
const client = new MongoClient(process.env.MONGODB_ATLAS_URI);

// Connect to MongoDB (top-level await)
try {
    await client.connect();
    console.log("[INFO] Connected to MongoDB Atlas successfully");
} catch (error) {
    console.error("[ERROR] Failed to connect to MongoDB:", error.message);
    process.exit(1);
}

// Get collection and initialize vector store after connection
const collection = client
    .db(process.env.MONGODB_ATLAS_DB_NAME)
    .collection(process.env.MONGODB_ATLAS_COLLECTION_NAME);

const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
    collection,
    indexName: "vector_index_1",
    textKey: "text",
    embeddingKey: "embedding",
});

// Create similarity search tool that the agent can call
const similarityTool = new DynamicStructuredTool({
    name: "similarity_search",
    description: "Perform similarity search against the RAG vector store. Input: { query: string, k?: number }",
    schema: z.object({
        query: z.string(),
        k: z.number().optional(),
    }),
    func: async (input) => {
        try {
            const q = input.query;
            const k = input.k ?? 3;
            const results = await vectorStore.similaritySearch(q, k);
            // Return joined page contents so the agent receives context text
            return results.map(r => r.pageContent).join("\n\n---\n\n");
        } catch (err) {
            console.error('[ERROR] similarityTool execution failed:', err);
            return `Error executing similarity search: ${err?.message ?? String(err)}`;
        }
    }
});

const tools = [similarityTool];

// Create a checkpointer (persisted memory) and agent that uses the LLM
const checkpointer = new MongoDBSaver({
    client: client,
    dbName: "langgraph_db"
});
const ragAgent = createReactAgent({ llm, tools, checkpointer });

// Optional: Function to load and add CSV documents
async function loadAndAddCSV() {
    try {
        // Load the CSV file from RAG directory
        const filePath = join(__dirname, "Book1.csv");
        const loader = new CSVLoader(filePath);
        const docs = await loader.load();

        // Split the docs into chunks
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const splitDocs = await textSplitter.splitDocuments(docs);

        // Add to vector store
        await vectorStore.addDocuments(splitDocs);
        console.log("[INFO] CSV documents added to vector store");
        return { message: "CSV loaded and added successfully" };
    } catch (error) {
        console.error("[ERROR] Error loading CSV:", error.message);
        throw error;
    }
}

export async function runRAGAgent(query, k = 3, thread_id, response_mode, res) {
    const threadIdToUse = thread_id || `rag-${Math.random().toString(36).substring(7)}`;
    console.log(`[INFO] Invoking agent with query: "${query}" and thread_id: ${threadIdToUse}`);

    if (response_mode === "streaming") {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders && res.flushHeaders();

        for await (const chunk of await ragAgent.stream(
            { messages: [systemMessage, new HumanMessage(query)] },
            { configurable: { thread_id: threadIdToUse }, streamMode: "messages" }
        )) {
            const content = Array.isArray(chunk) ? (chunk[0]?.content || "") : (chunk.content || "");
            console.log("🔍 Streaming chunk:", content);
            if (content) {
                res.write(`data: ${content.replace(/\n/g, '\\n')}\n\n`);
            }
        }
        res.write('event: done\ndata: [DONE]\n\n');
        res.end();
        return null;
    } else {
        const response = await ragAgent.invoke(
            { messages: [systemMessage, new HumanMessage(query)] },
            { configurable: { thread_id: threadIdToUse } }
        );

        const lastMessage = response.messages?.at(-1);
        const finalReply = Array.isArray(lastMessage?.content)
            ? lastMessage.content.map((c) => c.text || "").join("")
            : lastMessage?.content || response.output || "No response";
        console.log("[INFO] Agent Response:", finalReply);
        return finalReply;
    }
}

export { ragAgent, tools, loadAndAddCSV };

// Graceful shutdown
process.on('SIGINT', async () => {
    await client.close();
    console.log("[INFO] MongoDB connection closed");
    process.exit(0);
});