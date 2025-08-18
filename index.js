import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ===== CORS robusto =====
const ORIGINS = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // server-to-server o curl
    if (ORIGINS.includes("*") || ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS: " + origin), false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ===== Variabili di ambiente =====
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DOCS_JSON_URL = process.env.DOCS_JSON_URL || null;

// ===== Helper: scarica lista documenti =====
async function loadDocs() {
  if (!DOCS_JSON_URL) return [];
  try {
    const res = await fetch(DOCS_JSON_URL);
    if (!res.ok) throw new Error("Docs fetch error " + res.status);
    return await res.json();
  } catch (err) {
    console.error("Errore caricamento docs:", err.message);
    return [];
  }
}

// ===== Endpoint principale chat =====
app.post("/api/chat", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt mancante" });

    // Carica documenti ufficiali
    const docs = await loadDocs();
    const context = docs.length
      ? "Documenti disponibili: " + docs.join(", ")
      : "Nessun documento caricato.";

    // Chiama OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Sei Foglia, Custode AI di Ecoverso." },
          { role: "system", content: context },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const reply = data.choices?.[0]?.message?.content || "(nessuna risposta)";
    res.json({ reply });

  } catch (err) {
    console.error("Errore /api/chat:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Endpoint diagnostico =====
app.get("/debug/cors", (req, res) => {
  res.json({
    originHeader: req.headers.origin || null,
    allowedOrigins: ORIGINS,
  });
});

// ===== Start =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Foglia AI server in ascolto su porta ${PORT}`);
});
