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

  const dailyBudget = Math.round(budget / duration);

  const prompt = `You are a world-class travel writer in the style of a luxury travel magazine.

Plan a ${duration}-day trip to ${location} from ${startDate} to ${endDate} with a total budget of $${budget} USD (roughly $${dailyBudget}/day).

Return ONLY a valid JSON object. No markdown, no backticks, no explanation — just raw JSON.

Use this exact structure:
{
  "days": [
    {
      "title": "A short evocative title for the day (e.g. 'Markets, Mosaics & Mint Tea')",
      "activities": "A vivid paragraph describing the day from morning to evening. Include specific place names, restaurants, and practical tips. Write in an engaging travel magazine style.",
      "estimatedCost": "A realistic daily cost estimate as a string e.g. '$120'"
    }
  ]
}

Make each day distinct. Include culture, food, exploration, and relaxation. Name actual restaurants, landmarks, and neighborhoods. Be specific and inspiring.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    // Strip markdown code fences if present, then parse
    let raw = message.content[0].text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "\nRaw response:", raw);
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