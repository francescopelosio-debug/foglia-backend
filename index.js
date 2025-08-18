// ========== Foglia Backend (Express + CORS) ==========

import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());

// --- Origini consentite ---
const allowedOrigins = [
  "https://staging.ecoverso.earth",
  "https://ecoverso.earth",
  "http://localhost:8080"
];

// --- Configurazione CORS ---
app.use(cors({
  origin: function (origin, callback) {
    // Consenti richieste senza header Origin (es. curl, test locali)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

// --- Gestione preflight OPTIONS ---
app.options("/api/chat", cors());

// --- Endpoint principale di Foglia ---
app.post("/api/chat", (req, res) => {
  const { message } = req.body;
  console.log("Messaggio ricevuto:", message);

  // Risposta demo (qui collegherai il modello AI vero)
  res.json({
    reply: `🌿 Foglia ti risponde: ho ricevuto -> "${message}"`
  });
});

// --- Porta (Render usa process.env.PORT) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Foglia backend attivo su porta ${PORT}`);
});
