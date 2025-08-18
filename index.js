// Backend minimo per STAGING Ecoverso
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// *** IMPORTANTISSIMO: consenti SOLO lo staging ora ***
const ALLOWED_ORIGINS = [
  "https://staging.ecoverso.earth",
  // se vuoi test locale aggiungi: "http://localhost:5173"
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // permetti curl/postman
      cb(null, ALLOWED_ORIGINS.includes(origin));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

// Healthcheck
app.get("/", (_req, res) => {
  res.type("text").send("🌿 Foglia STAGING attiva.");
});

// Chat minima (senza OpenAI): risponde subito e fa echo
app.post("/api/chat", (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "prompt mancante" });

  // Risposta fissa + eco per test front-end
  const reply =
    "Ciao! Sono Foglia (staging). Mi hai scritto: “" + prompt + "”. 🌿";
  res.json({ reply });
});

// Porta/bind richiesti da Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Foglia STAGING su :${PORT}`)
);
