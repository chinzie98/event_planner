import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =====================
// Plan Trip
// =====================
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

    let raw = message.content[0].text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      res.json({ suggestions: raw });
    }

  } catch (error) {
    console.error("Anthropic error:", error);
    res.status(500).json({ error: "Failed to generate your itinerary. Please try again." });
  }
});

// =====================
// Save Trip
// =====================
app.post("/save-trip", async (req, res) => {
  const { userId, location, startDate, endDate, budget, duration, days } = req.body;

  if (!userId) return res.status(401).json({ error: "You must be logged in to save a trip." });
  if (!location || !days) return res.status(400).json({ error: "Missing trip data." });

  try {
    const { data, error } = await supabase
      .from("trips")
      .insert({
        user_id: userId,
        location,
        start_date: startDate,
        end_date: endDate,
        budget,
        duration,
        days
      })
      .select("id")
      .single();

    if (error) throw error;
    res.json({ tripId: data.id });

  } catch (error) {
    console.error("Save trip error:", error);
    res.status(500).json({ error: "Failed to save trip." });
  }
});

// =====================
// Get My Trips
// =====================
app.get("/my-trips/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!userId) return res.status(401).json({ error: "User ID required." });

  try {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);

  } catch (error) {
    console.error("My trips error:", error);
    res.status(500).json({ error: "Failed to load trips." });
  }
});

// =====================
// Get Shared Trip
// =====================
app.get("/get-trip/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return res.status(404).json({ error: "Trip not found." });
    res.json(data);

  } catch (error) {
    console.error("Get trip error:", error);
    res.status(500).json({ error: "Failed to retrieve trip." });
  }
});

// =====================
// Delete Trip
// =====================
app.delete("/delete-trip/:id", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) return res.status(401).json({ error: "User ID required." });

  try {
    const { error } = await supabase
      .from("trips")
      .delete()
      .eq("id", id)
      .eq("user_id", userId); // ensures users can only delete their own trips

    if (error) throw error;
    res.json({ success: true });

  } catch (error) {
    console.error("Delete trip error:", error);
    res.status(500).json({ error: "Failed to delete trip." });
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;