import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// vi.hoisted runs before any imports, so mocks are in place when server.js loads
const { mockAnthropicCreate, mockSingle, mockChain } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockChain = {};
  mockChain.from = vi.fn(() => mockChain);
  mockChain.insert = vi.fn(() => mockChain);
  mockChain.select = vi.fn(() => mockChain);
  mockChain.eq = vi.fn(() => mockChain);
  mockChain.single = mockSingle;

  const mockAnthropicCreate = vi.fn();
  return { mockAnthropicCreate, mockSingle, mockChain };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: mockAnthropicCreate } })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockChain),
}));

import app from "../server.js";

// =====================
// POST /plan-trip
// =====================
describe("POST /plan-trip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when location is missing", async () => {
    const res = await request(app)
      .post("/plan-trip")
      .send({ budget: 1000, duration: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/destination/i);
  });

  it("returns 400 when budget is missing", async () => {
    const res = await request(app)
      .post("/plan-trip")
      .send({ location: "Paris", duration: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/budget/i);
  });

  it("returns 400 when duration is missing", async () => {
    const res = await request(app)
      .post("/plan-trip")
      .send({ location: "Paris", budget: 1000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dates/i);
  });

  it("returns parsed itinerary on success", async () => {
    const itinerary = {
      days: [
        {
          title: "Markets & Mosaics",
          activities: "Explore the medina at dawn...",
          estimatedCost: "$120",
        },
      ],
    };
    mockAnthropicCreate.mockResolvedValue({
      content: [{ text: JSON.stringify(itinerary) }],
    });

    const res = await request(app).post("/plan-trip").send({
      location: "Marrakech",
      budget: 1500,
      duration: 3,
      startDate: "Apr 1, 2026",
      endDate: "Apr 3, 2026",
    });

    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].title).toBe("Markets & Mosaics");
  });

  it("strips markdown code fences before parsing", async () => {
    const itinerary = {
      days: [{ title: "Arrival Day", activities: "Check in", estimatedCost: "$80" }],
    };
    mockAnthropicCreate.mockResolvedValue({
      content: [{ text: "```json\n" + JSON.stringify(itinerary) + "\n```" }],
    });

    const res = await request(app).post("/plan-trip").send({
      location: "Tokyo",
      budget: 2000,
      duration: 1,
      startDate: "May 1, 2026",
      endDate: "May 1, 2026",
    });

    expect(res.status).toBe(200);
    expect(res.body.days[0].title).toBe("Arrival Day");
  });

  it("strips plain code fences (no language tag)", async () => {
    const itinerary = {
      days: [{ title: "Rooftops & Ruins", activities: "Wander", estimatedCost: "$90" }],
    };
    mockAnthropicCreate.mockResolvedValue({
      content: [{ text: "```\n" + JSON.stringify(itinerary) + "\n```" }],
    });

    const res = await request(app).post("/plan-trip").send({
      location: "Rome",
      budget: 1200,
      duration: 1,
      startDate: "Jun 1, 2026",
      endDate: "Jun 1, 2026",
    });

    expect(res.status).toBe(200);
    expect(res.body.days[0].title).toBe("Rooftops & Ruins");
  });

  it("returns raw suggestions when Claude response is not valid JSON", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ text: "Here is a great trip to Paris with lots of things to do..." }],
    });

    const res = await request(app).post("/plan-trip").send({
      location: "Paris",
      budget: 1000,
      duration: 2,
      startDate: "Apr 1, 2026",
      endDate: "Apr 2, 2026",
    });

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toBeDefined();
    expect(typeof res.body.suggestions).toBe("string");
  });

  it("returns 500 when Anthropic API throws", async () => {
    mockAnthropicCreate.mockRejectedValue(new Error("Anthropic API unavailable"));

    const res = await request(app).post("/plan-trip").send({
      location: "Paris",
      budget: 1000,
      duration: 2,
      startDate: "Apr 1, 2026",
      endDate: "Apr 2, 2026",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed/i);
  });

  it("calculates daily budget and passes it to Claude", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ text: JSON.stringify({ days: [] }) }],
    });

    await request(app).post("/plan-trip").send({
      location: "Bali",
      budget: 900,
      duration: 3,
      startDate: "Jul 1, 2026",
      endDate: "Jul 3, 2026",
    });

    const calledPrompt = mockAnthropicCreate.mock.calls[0][0].messages[0].content;
    expect(calledPrompt).toContain("$300/day"); // 900 / 3 = 300
  });
});

// =====================
// POST /save-trip
// =====================
describe("POST /save-trip", () => {
  beforeEach(() => vi.clearAllMocks());

  const validTrip = {
    userId: "user-123",
    location: "Paris",
    startDate: "Apr 1, 2026",
    endDate: "Apr 3, 2026",
    budget: 1500,
    duration: 3,
    days: [{ title: "Day 1", activities: "Explore Montmartre", estimatedCost: "$120" }],
  };

  it("returns 401 when userId is missing", async () => {
    const res = await request(app)
      .post("/save-trip")
      .send({ location: "Paris", days: [] });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/logged in/i);
  });

  it("returns 400 when location is missing", async () => {
    const res = await request(app)
      .post("/save-trip")
      .send({ userId: "user-123", days: [{ title: "Day 1" }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  it("returns 400 when days is missing", async () => {
    const res = await request(app)
      .post("/save-trip")
      .send({ userId: "user-123", location: "Paris" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  it("returns tripId on successful save", async () => {
    mockSingle.mockResolvedValue({ data: { id: "trip-abc-123" }, error: null });

    const res = await request(app).post("/save-trip").send(validTrip);

    expect(res.status).toBe(200);
    expect(res.body.tripId).toBe("trip-abc-123");
  });

  it("inserts correct fields into Supabase", async () => {
    mockSingle.mockResolvedValue({ data: { id: "trip-xyz" }, error: null });

    await request(app).post("/save-trip").send(validTrip);

    expect(mockChain.from).toHaveBeenCalledWith("trips");
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        location: "Paris",
        budget: 1500,
      })
    );
  });

  it("returns 500 when Supabase returns an error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error("DB constraint violation") });

    const res = await request(app).post("/save-trip").send(validTrip);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed/i);
  });

  it("returns 500 when Supabase throws", async () => {
    mockSingle.mockRejectedValue(new Error("Connection refused"));

    const res = await request(app).post("/save-trip").send(validTrip);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed/i);
  });
});

// =====================
// GET /get-trip/:id
// =====================
describe("GET /get-trip/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  const storedTrip = {
    id: "trip-abc-123",
    user_id: "user-123",
    location: "Paris",
    start_date: "2026-04-01",
    end_date: "2026-04-03",
    budget: 1500,
    duration: 3,
    days: [{ title: "Day 1", activities: "Explore Montmartre", estimatedCost: "$120" }],
  };

  it("returns full trip data on success", async () => {
    mockSingle.mockResolvedValue({ data: storedTrip, error: null });

    const res = await request(app).get("/get-trip/trip-abc-123");

    expect(res.status).toBe(200);
    expect(res.body.location).toBe("Paris");
    expect(res.body.days).toHaveLength(1);
    expect(res.body.id).toBe("trip-abc-123");
  });

  it("queries Supabase with the correct trip ID", async () => {
    mockSingle.mockResolvedValue({ data: storedTrip, error: null });

    await request(app).get("/get-trip/trip-abc-123");

    expect(mockChain.from).toHaveBeenCalledWith("trips");
    expect(mockChain.eq).toHaveBeenCalledWith("id", "trip-abc-123");
  });

  it("returns 404 when trip is not found (null data)", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    const res = await request(app).get("/get-trip/nonexistent-id");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 404 when Supabase returns an error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "No rows returned" } });

    const res = await request(app).get("/get-trip/bad-id");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 500 when Supabase throws", async () => {
    mockSingle.mockRejectedValue(new Error("Network timeout"));

    const res = await request(app).get("/get-trip/trip-abc-123");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/failed/i);
  });
});
