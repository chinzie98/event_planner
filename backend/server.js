import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "16kb" }));

// =====================
// Rate Limiting
// =====================

// Global: 300 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// /plan-trip: 15 requests per hour per user (Anthropic API — costs money)
const planTripLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many trip requests. Please wait before trying again." },
});

// Auth-adjacent write endpoints: 20 per hour per user
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

app.use(globalLimiter);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =====================
// Auth Middleware
// =====================
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
  }
  req.user = user;
  next();
}

// =====================
// Plan Trip
// =====================
app.post("/plan-trip", requireAuth, planTripLimiter, async (req, res) => {
  const userId = req.user.id;
  const { location, budget, startDate, endDate, duration, travelStyle, groupType, dietary } = req.body;

  if (!location) return res.status(400).json({ error: "A destination is required." });
  if (!budget) return res.status(400).json({ error: "A budget is required." });
  if (!duration) return res.status(400).json({ error: "Travel dates are required." });

  // Input validation
  if (typeof location !== "string" || location.length > 200)
    return res.status(400).json({ error: "Invalid destination." });
  if (typeof dietary === "string" && dietary.length > 300)
    return res.status(400).json({ error: "Dietary notes are too long." });
  const budgetNum = Number(budget);
  if (!Number.isFinite(budgetNum) || budgetNum < 1 || budgetNum > 1_000_000)
    return res.status(400).json({ error: "Budget must be between $1 and $1,000,000." });
  const durationNum = Number(duration);
  if (!Number.isInteger(durationNum) || durationNum < 1 || durationNum > 30)
    return res.status(400).json({ error: "Trip duration must be between 1 and 30 days." });
  const VALID_STYLES = ["cultural", "foodie", "adventure", "relaxed", "luxury"];
  const VALID_GROUPS = ["solo", "couple", "family", "friends"];
  if (travelStyle && (!Array.isArray(travelStyle) || travelStyle.some(s => !VALID_STYLES.includes(s))))
    return res.status(400).json({ error: "Invalid travel style." });
  if (groupType && !VALID_GROUPS.includes(groupType))
    return res.status(400).json({ error: "Invalid group type." });

  // Check usage limit for non-premium users
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("user_id", userId)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    // PGRST116 = row not found (user has no profile yet — treat as free)
    console.error("Profile lookup error:", profileError);
    return res.status(500).json({ error: "Failed to verify account status." });
  }

  const isPremium = profile?.is_premium || false;

  if (!isPremium) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", twentyFourHoursAgo);

    if (countError) {
      console.error("Usage count error:", countError);
      return res.status(500).json({ error: "Failed to verify usage limit." });
    }

    if (count >= 3) {
      return res.status(429).json({ error: "usage_limit" });
    }
  }

  // Log this usage
  const { error: logError } = await supabase.from("usage_logs").insert({ user_id: userId });
  if (logError) {
    console.error("Usage log error:", logError);
    return res.status(500).json({ error: "Failed to record usage." });
  }

  const dailyBudget = Math.round(budget / duration);

  // Build optional preference lines
  const prefLines = [];
  if (groupType) prefLines.push(`Travelling as: ${groupType}`);
  if (travelStyle && travelStyle.length) prefLines.push(`Travel style: ${travelStyle.join(", ")}`);
  if (dietary) prefLines.push(`Dietary notes: ${dietary}`);
  const prefsSection = prefLines.length
    ? `\nTraveller preferences:\n${prefLines.map(l => `- ${l}`).join("\n")}\n`
    : "";

  // One-shot example to anchor output quality and format
  const exampleRequest = `Plan a 1-day trip to Kyoto for a couple from Apr 10 to Apr 10 with a total budget of $180 USD (roughly $180/day).\nTraveller preferences:\n- Travelling as: couple\n- Travel style: cultural\nReturn ONLY the JSON object.`;
  const exampleResponse = JSON.stringify({
    days: [{
      title: "Temples, Tofu & Twilight in Gion",
      activities: "Begin at Fushimi Inari Taisha before the crowds arrive — the thousands of vermillion torii gates glow in early morning light. Hire a bicycle from Eki Rent-a-Car near Kyoto Station and ride north along the Kamo River to the Philosopher's Path, stopping at Nanzen-ji's soaring aqueduct. Lunch at Omen, a beloved udon restaurant on the path. Spend the afternoon in Gion's preserved machiya townhouses and catch glimpses of geiko on Hanamikoji Street. End with a multi-course kaiseki dinner at Kikunoi Honten — the seasonal vegetables and tofu are extraordinary.",
      highlights: [
        "Arrive at Fushimi Inari by 7 am — crowds swell after 9",
        "Rent bicycles near Kyoto Station to cover the Philosopher's Path with ease",
        "Reserve Kikunoi Honten at least two weeks in advance"
      ],
      tip: "Wear slip-on shoes — you'll be removing footwear at every temple.",
      estimatedCost: "$175"
    }]
  });

  const userPrompt = `Plan a ${duration}-day trip to ${location} from ${startDate} to ${endDate} with a total budget of $${budget} USD (roughly $${dailyBudget}/day).${prefsSection}
Return ONLY a valid JSON object — no markdown, no backticks, no explanation. Use this exact structure:
{
  "days": [
    {
      "title": "A short evocative title (e.g. 'Markets, Mosaics & Mint Tea')",
      "activities": "A vivid paragraph describing the full day from morning to evening. Include specific place names, restaurants, and sensory detail. Write in an engaging travel magazine style.",
      "highlights": ["Key highlight or booking tip #1", "Key highlight #2", "Key highlight #3"],
      "tip": "One practical insider tip for the day.",
      "estimatedCost": "Realistic daily cost as a string e.g. '$120'"
    }
  ]
}

Make each day distinct. Prioritise the traveller's preferences. Name actual restaurants, landmarks, and neighbourhoods. Be specific and inspiring.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: "You are a world-class travel writer and itinerary planner. You write in the vivid, specific style of a luxury travel magazine — evocative prose, real restaurant names, actual neighbourhood names, insider tips. You are also practical: you respect the traveller's budget, travel style, dietary needs, and group type.",
      messages: [
        { role: "user", content: exampleRequest },
        { role: "assistant", content: exampleResponse },
        { role: "user", content: userPrompt }
      ],
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
app.post("/save-trip", requireAuth, writeLimiter, async (req, res) => {
  const userId = req.user.id;
  const { location, startDate, endDate, budget, duration, days } = req.body;

  if (!location || !days) return res.status(400).json({ error: "Missing trip data." });

  // Only premium users can save trips
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("user_id", userId)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    console.error("Profile lookup error:", profileError);
    return res.status(500).json({ error: "Failed to verify account status." });
  }

  if (!profile?.is_premium) {
    return res.status(403).json({ error: "save_requires_premium" });
  }

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
app.get("/my-trips/:userId", requireAuth, async (req, res) => {
  const userId = req.user.id;

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
// User Profile
// =====================
app.get("/user-profile/:userId", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_premium, username")
    .eq("user_id", userId)
    .single();
  res.json({ is_premium: profile?.is_premium || false, username: profile?.username || null });
});

// =====================
// Frontend Config
// =====================
app.get("/config", (_req, res) => {
  res.json({ googleMapsKey: process.env.GOOGLE_PLACES_KEY || "" });
});

// =====================
// Check Username Availability
// =====================
app.post("/check-username", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Username is required." });

  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username))
    return res.status(400).json({ error: "Username must be 3–20 characters: letters, numbers, or underscores only." });

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    console.error("Check username error:", error);
    return res.status(500).json({ error: "Could not check username availability." });
  }

  if (data) return res.status(409).json({ error: "Username is already taken." });
  res.json({ available: true });
});

// =====================
// Set Username (called after Supabase signUp)
// =====================
app.post("/set-username", async (req, res) => {
  const { userId, username } = req.body;
  if (!userId || !username) return res.status(400).json({ error: "Missing required fields." });

  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username))
    return res.status(400).json({ error: "Invalid username format." });

  // Verify the user actually exists in auth before trusting the userId
  const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !user) return res.status(400).json({ error: "Invalid account." });

  // Check uniqueness
  const { data: existing } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: "Username is already taken." });

  // Upsert profile — store email alongside username for forgot-username lookups
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, username, email: user.email }, { onConflict: "user_id" });

  if (error) {
    console.error("Set username error:", error);
    return res.status(500).json({ error: "Failed to save username." });
  }

  res.json({ success: true });
});

// =====================
// Resolve Username → Email (used for login)
// =====================
app.post("/resolve-username", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Username is required." });

  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    console.error("Resolve username error:", error);
    return res.status(500).json({ error: "Could not look up username." });
  }
  if (!data?.email) return res.status(404).json({ error: "Username not found." });

  res.json({ email: data.email });
});

// =====================
// Forgot Username (lookup by email)
// =====================
app.get("/forgot-username", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email is required." });

  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("Forgot username error:", error);
    return res.status(500).json({ error: "Could not look up account." });
  }
  if (!data?.username) return res.status(404).json({ error: "No account found with that email." });

  res.json({ username: data.username });
});

// =====================
// Upgrade to Premium
// =====================
app.post("/upgrade-premium", requireAuth, writeLimiter, async (req, res) => {
  const userId = req.user.id;

  try {
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: userId, is_premium: true }, { onConflict: "user_id" });

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("Upgrade error:", error);
    res.status(500).json({ error: "Failed to upgrade account." });
  }
});

// =====================
// Delete Trip
// =====================
app.delete("/delete-trip/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

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
