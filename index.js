// ========== Foglia Backend (Express + CORS) ==========
import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());

// --- domini consentiti ---
const allowedOrigins = [
  "https://staging.ecoverso.earth",
  "https://ecoverso.earth",
  "http://localhost:8080"
];

// --- CORS: permette preflight e POST ---
// Tip: durante il debug puoi usare origin: "*" per capire se il problema è CORS.
// Quando tutto va, rimetti la allowlist.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin"); // evita cache sbagliate
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // se usi cookie/sessions, abilita anche:
  // res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// --- pagine di controllo ---
app.get("/", (_req, res) => {
  res.type("text/plain").send("Foglia backend: OK. Try /api/health or POST /api/chat");
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// --- endpoint chat (demo) ---
app.post("/api/chat", (req, res) => {
  const { message } = req.body ?? {};
  console.log("Origin:", req.headers.origin, "| Message:", message);
  res.json({ reply: `🌿 Foglia: ho ricevuto → “${message ?? ""}”` });
});

// --- avvio ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Foglia backend attivo su porta ${PORT}`);
});
