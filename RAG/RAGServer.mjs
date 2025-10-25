// RAGServer.mjs
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"; // Correct import
import { JinaEmbeddings } from "@langchain/community/embeddings/jina";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { MongoClient } from "mongodb";
import express from "express";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

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
    model: "openai/gpt-4o",
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

// Connect to MongoDB and start server only after successful connection
async function connectToMongoAndStartServer() {
    try {
        await client.connect();
        console.log("[INFO] Connected to MongoDB Atlas successfully");

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

        // Set up Express server
        const app = express();
        app.use(express.json()); // Parse JSON bodies

        // Middleware to check DB connection (though connection is ensured before server starts)
        app.use((req, res, next) => {
            if (client.topology.isConnected()) {
                console.log(`[INFO] Request received: ${req.method} ${req.path}`);
                next();
            } else {
                console.error("[ERROR] Database not connected");
                res.status(500).json({ error: "Database connection failed" });
            }
        });

        // Optional: Function to load and add CSV documents (call via /initialize endpoint if needed)
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

        // Endpoint to initialize/load CSV (optional, if data needs refreshing)
        app.post('/initialize', async (req, res) => {
            try {
                const result = await loadAndAddCSV();
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Endpoint for similarity search
        app.post('/search', async (req, res) => {
            try {
                const { query, k = 3 } = req.body; // Default k=3
                if (!query) {
                    return res.status(400).json({ error: "Query is required" });
                }

                console.log(`[INFO] Performing similarity search with query: "${query}" and k: ${k}`);

                // Perform similarity search
                const results = await vectorStore.similaritySearch(query, k);

                console.log(`[INFO] Found ${results.length} results: ${results.map(result => result.pageContent.substring(0, 200) + "...").join("\n")}`);

                console.log("--------------------------------");
                console.log('[INFO] Calling LLM with the following prompt:');
                console.log(results.map(result => result.pageContent).join("\n") + "\nQuestion: " + query);
                console.log("--------------------------------");
                const response = await llm.invoke([systemMessage, new HumanMessage(results.map(result => result.pageContent).join("\n") + "\nQuestion: " + query)]);
                console.log("[INFO] LLM Response:", response.content);
                return res.json({ response: response.content });


            } catch (error) {
                console.error("[ERROR] Error in search endpoint:", error.message);
                res.status(500).json({ error: error.message });
            }
        });

        // Start server
        const PORT = 5000;
        app.listen(PORT, () => {
            console.log(`[INFO] Server running on port ${PORT}`);
        });

    } catch (error) {
        console.error("[ERROR] Failed to connect to MongoDB:", error.message);
        process.exit(1);
    }
}

connectToMongoAndStartServer();

// Graceful shutdown
process.on('SIGINT', async () => {
    await client.close();
    console.log("[INFO] MongoDB connection closed");
    process.exit(0);
});