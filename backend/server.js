import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/plan-trip', async (req, res) => {
    const { budget } = req.body;

    if (!budget || budget <= 0) {
        return res.status(400).json({ error: 'Enter a valid budget' });
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: "You are a travel planner for budget-conscious travelers." },
                { role: "user", content: `Suggest 5 vacation destinations for a budget of $${budget}. Include rough cost estimates and tips.` }
            ]
        });

        const suggestions = response.choices[0].message.content;
        res.json({ suggestions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate travel ideas' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
