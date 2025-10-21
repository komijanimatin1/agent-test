// import { A2AClient } from "@a2a-js/sdk/client";
// import { v4 as uuidv4 } from "uuid";

// async function testA2AClient() {
//   const client = await A2AClient.fromCardUrl("http://localhost:5000/.well-known/agent-card.json");

//   const messageParams = {
//     message: {
//       kind: "message",
//       messageId: uuidv4(),
//       role: "user",
//       parts: [{ kind: "text", text: "Book a flight to Bangkok and the most luxurious hotel there." }],
//     },
//     configuration: {
//       blocking: true,
//       acceptedOutputModes: ["text/plain"],
//     },
//   };

//   try {
//     const response = await client.sendMessage(messageParams);
//     if (response.error) {
//       console.error("Client error:", response.error);
//       return;
//     }
//     // Corrected parsing to match your working output
//     const textResponse = response.result?.status?.message?.parts[0]?.text || "No text response";
//     console.log("Response from Travel Agent:", textResponse);
//   } catch (error) {
//     console.error("Communication error:", error);
//   }
// }

// testA2AClient();

// Example A2A Client to send a request (e.g., flight booking) without any clarification
// This client directly sends the request to the flight agent (or hotel by changing the URL)
// Run this as a separate script: node client.js

import { v4 as uuidv4 } from "uuid";
import { A2AClient } from "@a2a-js/sdk/client";

// Agent Card URL (change to hotel if needed: "http://localhost:5000/hotel/.well-known/agent-card.json")
const AGENT_CARD_URL = "http://localhost:5000/hotel/.well-known/agent-card.json";

// Example request: Flight booking (no clarification, direct transfer)
const userQuery = "reserve the most expensive hotel in bangkok"; // Or any direct request

async function sendRequest() {
  try {
    const client = await A2AClient.fromCardUrl(AGENT_CARD_URL);

    const messageParams = {
      message: {
        kind: "message",
        messageId: uuidv4(),
        role: "user",
        parts: [{ kind: "text", text: userQuery }],
      },
      configuration: {
        blocking: true,
        acceptedOutputModes: ["text/plain"],
      },
    };

    const response = await client.sendMessage(messageParams);

    if (response.error) {
      console.error("Error:", response.error);
    } else {
      const reply = response.result?.status?.message?.parts[0]?.text || "No response";
      console.log("Agent Reply:", reply);
    }
  } catch (err) {
    console.error("Client Error:", err);
  }
}

sendRequest();