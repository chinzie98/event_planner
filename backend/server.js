import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Build the prompt based on which option the user chose
function buildPrompt(option, { location, budget }) {
  if (option === "location") {
    return `You are an enthusiastic travel planner. The user wants to visit ${location}.
Suggest 5 specific things to do there, including one local food recommendation.
Keep it inspiring, practical, and under 200 words.`;
  }

  if (option === "budget") {
    return `You are an enthusiastic travel planner. The user has a vacation budget of $${budget}.
Suggest 3 destination ideas that fit this budget, with a brief note on why each is a great pick.
Keep it inspiring and under 200 words.`;
  }

  if (option === "surprise") {
    return `You are an enthusiastic travel planner. Surprise the user with one unexpected, exciting vacation destination.
Tell them where to go, what makes it special, and one thing they must do there.
Keep it fun and under 150 words.`;
  }
}

app.post("/plan-trip", async (req, res) => {
  const { option, location, budget } = req.body;

  // Validate the option
  if (!["location", "budget", "surprise"].includes(option)) {
    return res.status(400).json({ error: "Invalid option. Must be location, budget, or surprise." });
  }

  // Validate required fields per option
  if (option === "location" && !location) {
    return res.status(400).json({ error: "A location is required." });
  }
  if (option === "budget" && !budget) {
    return res.status(400).json({ error: "A budget amount is required." });
  }

  try {
    const prompt = buildPrompt(option, { location, budget });

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [
        { role: "user", content: prompt }
      ],
    });

    const suggestions = message.content[0].text;
    res.json({ suggestions });

  } catch (error) {
    console.error("Anthropic error:", error);
    res.status(500).json({ error: "Failed to generate travel suggestions. Please try again." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;