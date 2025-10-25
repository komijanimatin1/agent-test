import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END, Annotation } from "@langchain/langgraph";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, "..", ".env");
dotenv.config({ path: envPath });

if (!process.env.OPENROUTER_API_KEY) {
    console.error("❌ Missing OPENROUTER_API_KEY. Please create a .env file with your API key.");
    process.exit(1);
}

const llm = new ChatOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: "openai/gpt-4o",
    temperature: 0,
    configuration: {
        baseURL: "https://openrouter.ai/api/v1",
    },
});

// Agent URLs
const MEDIA_AGENT_URL = "http://localhost:5003";
const RAG_SERVER_URL = "http://localhost:5000";

// Helper function to call agent via simple /chat endpoint
async function callAgent(agentUrl, userMessage, userId = "user-123") {
    try {
        console.log(`📞 Calling agent at ${agentUrl}/chat...`);
        
        const response = await axios.post(`${agentUrl}/chat`, {
            message: userMessage,
            userId: userId
        });

        console.log(`✅ Received reply from agent`);
        return response.data.reply;
    } catch (error) {
        console.error(`❌ Error calling agent:`, error.message);
        return `Error: ${error.message}`;
    }
}

// Helper function to call RAG server via /search endpoint
async function callRAGServer(query, k = 3) {
    try {
        console.log(`🔍 Calling RAG server at ${RAG_SERVER_URL}/search...`);
        console.log(`📝 Query: "${query}", k: ${k}`);
        
        const response = await axios.post(`${RAG_SERVER_URL}/search`, {
            query: query,
            k: k
        });

        console.log(`✅ Received reply from RAG server`);
        return response.data.response;
    } catch (error) {
        console.error(`❌ Error calling RAG server:`, error.message);
        return `Error: ${error.message}`;
    }
}

// Define the state schema
const StateAnnotation = Annotation.Root({
    input: Annotation(),
    route: Annotation(),
    output: Annotation(),
});

// Build the orchestrator graph
const orchestratorGraph = new StateGraph(StateAnnotation)
    // Router node - decides which service to call
    .addNode("router", async (state) => {
        const { input } = state;
        const decisionPrompt = `
User request: "${input}"

Analyze this request and decide which service should handle it:

- "media" if the request is about media, videos, movies, books, news or articles, comments, or media content
  Examples: "show me all videos", "add comment to video", "play movie", "show me all books", "show me all news", "show me all articles", "show me all comments", "show me all media content"

- "casie" if the request is about services, legal services, or general services
  Examples: "I need legal consultation", "book a service", "find lawyers"

- "rag" if the request needs information retrieval, document search, or knowledge base queries
  Examples: "مهم‌ترین کالاهایی که بین دو کشور مبادله می‌شود کدامند؟", "what are the main products traded between countries?", "search for information about trade", "find data about exports", "what does the document say about...", "search the knowledge base for..."

The user query "${input}" should be routed to RAG if it:
- Asks for specific information or facts
- Requests data analysis or insights
- Needs document search or knowledge retrieval
- Contains questions about content in a knowledge base
- Asks "what", "which", "how many", "find", "search", "tell me about"

Respond ONLY with valid JSON (no markdown, no explanation):

{"route": "media"} or {"route": "casie"} or {"route": "rag"}

Example: {"route": "rag"}
`;
        
        const decision = await llm.invoke([{ role: "user", content: decisionPrompt }]);
        
        try {
            let content = String(decision.content || "").trim();
            // Remove markdown code blocks if present
            content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const parsed = JSON.parse(content);
            const route = parsed.route;
            
            if (!["media", "casie", "rag"].includes(route)) {
                console.log("🧭 Router decision: media (default)");
                return { route: "media" };
            }
            
            console.log("🧭 Router decision:", route);
            return { route };
        } catch (e) {
            console.log("⚠️  Failed to parse router response, defaulting to media");
            return { route: "media" };
        }
    })
    
    // Media service node - calls the Media agent via HTTP
    .addNode("media", async (state) => {
        console.log("🎬 Routing to Media Agent (http://localhost:5003)...");
        const response = await callAgent(MEDIA_AGENT_URL, state.input);
        return { output: response };
    })
    
    // Casie service node
    .addNode("casie", async (state) => {
        console.log("⚖️  ===== CASIE SERVICE =====");
        console.log("📝 User Input:", state.input);
        console.log("✅ Casie service would handle this request");
        console.log("==========================");
        return { output: "Casie service processed the request" };
    })
    
    // RAG service node - calls the RAG server via HTTP
    .addNode("rag", async (state) => {
        console.log("🔍 ===== RAG SERVICE =====");
        console.log("📝 User Input:", state.input);
        const response = await callRAGServer(state.input, 3);
        console.log("=========================");
        return { output: response };
    })
    
    // Connect the nodes
    .addConditionalEdges("router", (state) => state.route)
    .addEdge("media", END)
    .addEdge("casie", END)
    .addEdge("rag", END)
    .setEntryPoint("router");

// Compile the graph
const graph = orchestratorGraph.compile();

// Get user message from CLI or use default
// const userMessage = process.argv.slice(2).join(" ") || "Show me all media files";
const userMessage = " ایدیشو داری توی ایجنت media";
console.log("\n🎯 User Query:", userMessage);
console.log("─".repeat(60));

const result = await graph.invoke({ input: userMessage });

console.log("─".repeat(60));
console.log("🎉 Orchestrator Final Result:", result.output);