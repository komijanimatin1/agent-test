// import { MultiServerMCPClient } from "@langchain/mcp-adapters";
// import { ChatOpenAI } from "@langchain/openai";
// import { HumanMessage } from "@langchain/core/messages";
// import { createAgent } from "@langchain";

// // Simple test without the problematic imports



// // try {
// //   const response = await llm.invoke([new HumanMessage("Hello! Can you tell me a short joke?")]);
// //   console.log("LLM Response:", response.content);
// //   console.log("✅ Basic LangChain functionality is working!");
// // } catch (error) {
// //   console.error("❌ Error with LLM:", error.message);
// // }

// // Test MCP client (commented out for now due to missing token)


// const agent = new createAgent({
//   llm: llm,
//   tools: tools,
// });

// const result = await agent.invoke([new HumanMessage("Please reserve flight number 1 with confirm=true")]);
// console.log(result);

import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const llm = new ChatOpenAI({
  apiKey: "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",
  model: "openai/gpt-4o",
  temperature: 0,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

const tok="eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICI2SEZGV0hJTXcxUU5xeFY3S242RUhjdHU3LXNxWWhGTVZzaGlXVVZJVl8wIn0.eyJleHAiOjE3NTk1ODgzODcsImlhdCI6MTc1OTU4ODA4NywiYXV0aF90aW1lIjoxNzU5NTg1MzYyLCJqdGkiOiJvbnJ0YWM6ODI0N2ZkZmItOWMxNy01YjhjLTIwYzItZmNiYmEyN2M0NDRlIiwiaXNzIjoiaHR0cHM6Ly9kZXYuc3NvLmFybmFjb3JlLmlyL3JlYWxtcy90Y2NpbSIsImF1ZCI6WyJtY3Atc2VydmVyIiwicmVhbG0tbWFuYWdlbWVudCIsImFjY291bnQiXSwic3ViIjoiZmFmZGJmY2MtMzQ0YS00NzQwLWI4ZmMtZmRlMzc2YzBkZDE1IiwidHlwIjoiQmVhcmVyIiwiYXpwIjoiYWktc3BhIiwic2lkIjoiNTk2YzQzMjItNDkyNy00NDMyLWIxODEtMzI5MmQyN2NkZjRhIiwiYWNyIjoiMCIsImFsbG93ZWQtb3JpZ2lucyI6WyIvKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiZGVmYXVsdC1yb2xlcy10Y2NpbSIsIm9mZmxpbmVfYWNjZXNzIiwibWNwLndyaXRlIiwidW1hX2F1dGhvcml6YXRpb24iLCJtY3AuYWRtaW4iLCJtY3AucmVhZCJdfSwicmVzb3VyY2VfYWNjZXNzIjp7InJlYWxtLW1hbmFnZW1lbnQiOnsicm9sZXMiOlsidmlldy1yZWFsbSIsInZpZXctaWRlbnRpdHktcHJvdmlkZXJzIiwibWFuYWdlLWlkZW50aXR5LXByb3ZpZGVycyIsImltcGVyc29uYXRpb24iLCJyZWFsbS1hZG1pbiIsImNyZWF0ZS1jbGllbnQiLCJtYW5hZ2UtdXNlcnMiLCJxdWVyeS1yZWFsbXMiLCJ2aWV3LWF1dGhvcml6YXRpb24iLCJxdWVyeS1jbGllbnRzIiwicXVlcnktdXNlcnMiLCJtYW5hZ2UtZXZlbnRzIiwibWFuYWdlLXJlYWxtIiwidmlldy1ldmVudHMiLCJ2aWV3LXVzZXJzIiwidmlldy1jbGllbnRzIiwibWFuYWdlLWF1dGhvcml6YXRpb24iLCJtYW5hZ2UtY2xpZW50cyIsInF1ZXJ5LWdyb3VwcyJdfSwiYWNjb3VudCI6eyJyb2xlcyI6WyJtYW5hZ2UtYWNjb3VudCIsInZpZXctYXBwbGljYXRpb25zIiwibWFuYWdlLWFjY291bnQtbGlua3MiLCJ2aWV3LXByb2ZpbGUiXX19LCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwibWNwX3JvbGVzIjpbImRlZmF1bHQtcm9sZXMtdGNjaW0iLCJvZmZsaW5lX2FjY2VzcyIsIm1jcC53cml0ZSIsInVtYV9hdXRob3JpemF0aW9uIiwibWNwLmFkbWluIiwibWNwLnJlYWQiXSwiZW1haWxfdmVyaWZpZWQiOmZhbHNlLCJuYW1lIjoic2FlZWQgYXphZCIsInByZWZlcnJlZF91c2VybmFtZSI6InNhZWVkIiwibG9jYWxlIjoiZmEiLCJnaXZlbl9uYW1lIjoic2FlZWQiLCJmYW1pbHlfbmFtZSI6ImF6YWQiLCJlbWFpbCI6InNhZWVkLmZha2hyaWF6YWRAZ21haWwuY29tIn0.v7Ym-nqIAih2SuzJaYFHCnH-CeyEkngeQC7aYJFLcyGWxY0KjtwJsTfE8T4K6AzNMooF9cZ6IuyR_Sl6nJ6a2pQXbrxbAu5-P7oHpjbwdh0GiUDUNia-TVTW1OWQNtZ8CMRclC1xpEFTqufgZRIvahPlxk0e5nCAm7qL7pqmFH0oxER6upSNGBdCHNkQgImxFUug2VvwmZzV9OVKXExp2QaBtcZrym6B5BVrth764rsmslAlKHpYOOBh7TMwOHQQOv4jdrfK5s-wfUEHZ1JKzN0izceLPVlJ9eL7UUluCz9aCs65jUokBgacLlzXDgGYCJ905H7lc4T7kxZ_77XJrw"
const client = new MultiServerMCPClient({
  "Flights-MCP": {
    url: "http://localhost:4000/mcp",
    headers: {
      Authorization: `Bearer ${ tok }`,
    },
    // automaticSSEFallback: true,  // اختیاری، اگر نیاز باشه
  },
});

throw new Error(JSON.stringify(client));

// const client = new MultiServerMCPClient({
//   "Flights-MCP": {
//     url: "http://localhost:4000/mcp",
//     authProvider: new ProxyOAuthClientProvider({
//       baseUrl: "http://localhost:4000",
//       clientId: "ai-spa",
//       redirectUri: "http://localhost:4000/mcp",  // Match server config
//       scopes: ["openid", "profile", "email"],
//     }),
//   },
// });

// throw new Error(tok);
const tools = await client.getTools();

const agent = createReactAgent({
    llm,
    tools: tools,
});

console.log(
    await agent.invoke({
        messages: [{ role: "user", content: "Please reserve flight number 1 with confirm=true" }],
    })
);
