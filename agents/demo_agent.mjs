import axios from "axios";
import z from "zod";

// ابزارها از core میان نه از langgraph
import { tool } from "@langchain/core/tools";

// Agent رو از langgraph بگیر
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// مدل از openai
import { ChatOpenAI } from "@langchain/openai";

import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";

// ------------------ TOOLS ------------------

// 🔹 Flights
const getFlights = tool(
  async ({ destination }, config) => {
    config.writer?.(`🔍 جستجوی پرواز برای مقصد ${destination} ...`);
    const { data } = await axios.get("http://localhost:3001/flights");
    const available = data.find((f) => !f.reserved && f.to.toLowerCase().includes(destination.toLowerCase()));
    // config.writer?.(`✈️ نزدیک‌ترین پرواز: ${available.from} → ${available.to}`);
    config.writer?.(`✈️ نزدیک‌ترین پرواز: ${JSON.stringify(available)}`);
    return available;
  },
  {
    name: "get_flights",
    description: "دریافت پرواز برای مقصد مشخص",
    schema: z.object({ destination: z.string() }),
  }
);

const reserveFlight = tool(
  async ({ id }, config) => {
    config.writer?.(`🛫 در حال رزرو پرواز ${id} ...`);
    await axios.patch(`http://localhost:3001/flights/${id}`, { reserved: true });
    config.writer?.(`✅ پرواز رزرو شد!`);
    return { reserved: true };
  },
  {
    name: "reserve_flight",
    description: "رزرو پرواز بر اساس id",
    schema: z.object({ id: z.number() }),
  }
);

// 🔹 Hotels
const getHotels = tool(
  async ({ city }, config) => {
    config.writer?.(`🏨 جستجوی هتل در ${city} ...`);
    const { data } = await axios.get("http://localhost:3001/hotels");
    const available = data.find((h) => h.location.includes(city) && !h.reserved);
    config.writer?.(`🛏️ هتل پیشنهادی: ${available.name}`);
    return available;
  },
  {
    name: "get_hotels",
    description: "دریافت هتل‌ها در شهر مشخص",
    schema: z.object({ city: z.string() }),
  }
);

const reserveHotel = tool(
  async ({ id }, config) => {
    config.writer?.(`🏷️ در حال رزرو هتل ${id} ...`);
    await axios.patch(`http://localhost:3001/hotels/${id}`, { reserved: true });
    config.writer?.(`✅ هتل رزرو شد!`);
    return { reserved: true };
  },
  {
    name: "reserve_hotel",
    description: "رزرو هتل بر اساس id",
    schema: z.object({ id: z.number() }),
  }
);

// 🔹 Tours
const getTours = tool(
  async ({ destination }, config) => {
    config.writer?.(`🎯 جستجوی تور برای مقصد ${destination} ...`);
    const { data } = await axios.get("http://localhost:3001/tours");
    const available = data.find(
      (t) => t.destination.toLowerCase().includes(destination.toLowerCase()) && !t.reserved
    );
    config.writer?.(`🗺️ تور پیشنهادی: ${available.destination}`);
    return available;
  },
  {
    name: "get_tours",
    description: "گرفتن تورها برای مقصد مشخص",
    schema: z.object({ destination: z.string() }),
  }
);

const reserveTour = tool(
  async ({ id }, config) => {
    config.writer?.(`🏕️ رزرو تور ${id} ...`);
    await axios.patch(`http://localhost:3001/tours/${id}`, { reserved: true });
    config.writer?.(`✅ تور رزرو شد!`);
    return { reserved: true };
  },
  {
    name: "reserve_tour",
    description: "رزرو تور بر اساس id",
    schema: z.object({ id: z.number() }),
  }
);

// ------------------ MEMORY ------------------
async function createCheckpointer() {
  try {
    const uri = "mongodb+srv://agent-test:agent-test1404@langchain.ebn5nxx.mongodb.net/?retryWrites=true&w=majority&appName=LangChain";
    const client = new MongoClient(uri);
    await client.connect(); // اتصال به MongoDB
    const checkpointer = new MongoDBSaver({
      client,
      dbName: "langgraph_db",
      collectionName: "checkpoints"
    });
    return checkpointer;
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}

// ------------------ LLM ------------------
const llm = new ChatOpenAI({
  apiKey: "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",
  model: "openai/gpt-4o",
  temperature: 0,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

// ------------------ STREAM LOOP ------------------

async function runScenario() {
  const checkpointer = await createCheckpointer();

  // ------------------ AGENT ------------------
  const agent = createReactAgent({
    llm,
    tools: [getFlights, reserveFlight, getHotels, reserveHotel, getTours, reserveTour],
    checkpointer,
  });

  const steps = [
   "yes"
  ];

  for (const msg of steps) {
    console.log("\n==============================");
    console.log(`🧑‍💻 User: ${msg}`);
    console.log("==============================\n");

    for await (const [mode, chunk] of await agent.stream(
      { messages: [{ role: "user", content: msg }] },
      { streamMode: ["updates", "messages", "custom"],
        configurable: { thread_id: "1" } 
      },
    )) {
      console.log(`${mode}:`, chunk);
    }
  
  }
}

runScenario();