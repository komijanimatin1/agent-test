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

// A2A Agent URLs
const FLIGHT_AGENT_URL = "http://localhost:5001";
const HOTEL_AGENT_URL = "http://localhost:5002";

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

// Define the state schema
const StateAnnotation = Annotation.Root({
    input: Annotation(),
    route: Annotation(),
    flightQuery: Annotation(),
    hotelQuery: Annotation(),
    output: Annotation(),
});

// Build the orchestrator graph
const orchestratorGraph = new StateGraph(StateAnnotation)
    // Router node - decides which agent to call and extracts queries
    .addNode("router", async (state) => {
        const { input } = state;
        const decisionPrompt = `
User request: "${input}"

Analyze this request and decide:
- "flight" if only flight-related
- "hotel" if only hotel-related  
- "both" if it needs BOTH flight and hotel

If "both", also extract separate queries for each agent.

Respond ONLY with valid JSON (no markdown, no explanation):

For single agent: {"route": "flight"} or {"route": "hotel"}
For both agents: {"route": "both", "flightQuery": "flight-specific query", "hotelQuery": "hotel-specific query"}

Example: {"route": "both", "flightQuery": "Find a flight to Paris", "hotelQuery": "Find a 5-star hotel in Paris"}
`;
        
        const decision = await llm.invoke([{ role: "user", content: decisionPrompt }]);
        
        try {
            let content = String(decision.content || "").trim();
            // Remove markdown code blocks if present
            content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const parsed = JSON.parse(content);
            const route = parsed.route;
            
            if (!["flight", "hotel", "both"].includes(route)) {
                console.log("🧭 Router decision: flight (default)");
                return { route: "flight" };
            }
            
            console.log("🧭 Router decision:", route);
            
            if (route === "both") {
                const flightQuery = parsed.flightQuery || input;
                const hotelQuery = parsed.hotelQuery || input;
                console.log("📝 Flight query:", flightQuery);
                console.log("📝 Hotel query:", hotelQuery);
                return { route, flightQuery, hotelQuery };
            }
            
            return { route };
        } catch (e) {
            console.log("⚠️  Failed to parse router response, defaulting to flight");
            return { route: "flight" };
        }
    })
    
    // Flight agent node - calls the Flight agent via HTTP
    .addNode("flight", async (state) => {
        console.log("✈️ Routing to Flight Agent (http://localhost:5001)...");
        const response = await callAgent(FLIGHT_AGENT_URL, state.input);
        return { output: response };
    })
    
    // Hotel agent node - calls the Hotel agent via HTTP
    .addNode("hotel", async (state) => {
        console.log("🏨 Routing to Hotel Agent (http://localhost:5002)...");
        const response = await callAgent(HOTEL_AGENT_URL, state.input);
        return { output: response };
    })
    
    // Both agents node - calls both agents in parallel
    .addNode("both", async (state) => {
        console.log("✈️🏨 Routing to BOTH Flight and Hotel Agents...");
        
        // Use queries extracted by router
        const flightQuery = state.flightQuery || state.input;
        const hotelQuery = state.hotelQuery || state.input;
        
        // Call both agents in parallel with their specific queries
        const [flightResponse, hotelResponse] = await Promise.all([
            callAgent(FLIGHT_AGENT_URL, flightQuery),
            callAgent(HOTEL_AGENT_URL, hotelQuery)
        ]);
        
        // Combine the responses
        const combinedOutput = `
✈️ **Flight Agent Response:**
${flightResponse}

🏨 **Hotel Agent Response:**
${hotelResponse}
        `.trim();
        
        return { output: combinedOutput };
    })
    
    // Connect the nodes
    .addConditionalEdges("router", (state) => state.route)
    .addEdge("flight", END)
    .addEdge("hotel", END)
    .addEdge("both", END)
    .setEntryPoint("router");

// Compile the graph
const graph = orchestratorGraph.compile();

// Get user message from CLI or use default
// const userMessage = process.argv.slice(2).join(" ") || "I need a flight to Bangkok.";
const userMessage = "reserve the most expensive hotel in bangkok";
console.log("\n🎯 User Query:", userMessage);
console.log("─".repeat(60));

const result = await graph.invoke({ input: userMessage });

console.log("─".repeat(60));
console.log("🎉 Orchestrator Final Result:", result.output);

