import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/plan-trip", async (req, res) => {
  const { budget } = req.body;

  if (!budget) {
    return res.status(400).json({ error: "Budget is required" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful travel planner." },
        { role: "user", content: `Suggest 5 vacation destinations for a budget of $${budget}.` }
      ]
    });

    res.json({ suggestions: completion.choices[0].message.content });
  } catch (error) {
    console.error("Error in OpenAI request:", error);
    res.status(500).json({ error: "Failed to generate travel suggestions" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;

