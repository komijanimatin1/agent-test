import axios from "axios";
import z from "zod";

// ابزارها از core میان نه از langgraph
import { tool } from "@langchain/core/tools";

// Agent رو از langgraph بگیر
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// مدل از openai
import { ChatOpenAI } from "@langchain/openai";

// ------------------ TOOLS ------------------

// 🔹 Flights
const getFlights = tool(
  async ({ date }, config) => {
    config.writer?.(`🔍 جستجوی پرواز برای تاریخ ${date} ...`);
    const { data } = await axios.get("http://localhost:3001/flights");
    const available = data.find((f) => !f.reserved);
    config.writer?.(`✈️ نزدیک‌ترین پرواز: ${available.from} → ${available.to}`);
    return available;
  },
  {
    name: "get_flights",
    description: "دریافت لیست پروازهای موجود",
    schema: z.object({ date: z.string() }),
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
// ------------------ LLM ------------------
const llm = new ChatOpenAI({
    apiKey: "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",
    model: "openai/gpt-4o",
    temperature: 0,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  });
// ------------------ AGENT ------------------

const agent = createReactAgent({
  llm,
  tools: [getFlights, reserveFlight, getHotels, reserveHotel, getTours, reserveTour],
});

// ------------------ STREAM LOOP ------------------

async function runScenario() {
  const steps = [
    "میخوام پرواز بگیرم برای ۲۰ دسامبر",
    "اون پروازو برام رزرو کن",
    "برای مقصدش هتل پیدا کن",
    "اون هتل رو رزرو کن",
    "میخوام برای اون مقصد ی تور گردشگری هم رزرو کنم",
  ];

  for (const msg of steps) {
    console.log("\n==============================");
    console.log(`🧑‍💻 User: ${msg}`);
    console.log("==============================\n");

    for await (const [mode, chunk] of await agent.stream(
      { messages: [{ role: "user", content: msg }] },
      { streamMode: ["updates", "messages", "custom"] }
    )) {
      console.log(`${mode}:`, chunk);
    }
  }
}

runScenario();
