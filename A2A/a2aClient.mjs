import { A2AClient } from "@a2a-js/sdk/client";
import { v4 as uuidv4 } from "uuid";

async function testA2AClient() {
  const client = await A2AClient.fromCardUrl("http://localhost:5000/.well-known/agent-card.json");

  const messageParams = {
    message: {
      kind: "message",
      messageId: uuidv4(),
      role: "user",
      parts: [{ kind: "text", text: "Book a flight to Bangkok and the most luxurious hotel there." }],
    },
    configuration: {
      blocking: true,
      acceptedOutputModes: ["text/plain"],
    },
  };

  try {
    const response = await client.sendMessage(messageParams);
    if (response.error) {
      console.error("Client error:", response.error);
      return;
    }
    // Corrected parsing to match your working output
    const textResponse = response.result?.status?.message?.parts[0]?.text || "No text response";
    console.log("Response from Travel Agent:", textResponse);
  } catch (error) {
    console.error("Communication error:", error);
  }
}

testA2AClient();