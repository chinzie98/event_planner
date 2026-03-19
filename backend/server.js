import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.post("/plan-trip", async (req, res) => {
  const { location, budget, startDate, endDate, duration } = req.body;

  if (!location) return res.status(400).json({ error: "A destination is required." });
  if (!budget) return res.status(400).json({ error: "A budget is required." });
  if (!duration) return res.status(400).json({ error: "Travel dates are required." });

  const prompt = `You are a world-class travel writer in the style of a luxury travel magazine.

Plan a ${duration}-day trip to ${location} from ${startDate} to ${endDate} with a total budget of $${budget} USD.

Return ONLY a valid JSON object with no extra text, no markdown, no backticks. Use this exact structure:
{
  "days": [
    {
      "title": "A short evocative title for the day (e.g. 'Markets, Mosaics & Mint Tea')",
      "activities": "A vivid, detailed paragraph describing the day from morning to evening. Include specific place names, meal recommendations, and practical tips. Write in the engaging style of a travel magazine feature."
    }
  ]
}

Make each day feel distinct and memorable. Include a mix of culture, food, exploration, and relaxation. Be specific — name actual restaurants, landmarks, and neighborhoods. Account for a realistic daily budget based on the total of $${budget} over ${duration} days.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        { role: "user", content: prompt }
      ],
    });

    const raw = message.content[0].text.trim();

    // Parse the JSON response
    try {
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (parseError) {
      // If JSON parsing fails, return raw text as fallback
      console.error("JSON parse error:", parseError);
      res.json({ suggestions: raw });
    }

  } catch (error) {
    console.error("Anthropic error:", error);
    res.status(500).json({ error: "Failed to generate your itinerary. Please try again." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;