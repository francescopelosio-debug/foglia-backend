// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Inizializza OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Rotta di test per Render (GET /)
app.get('/', (req, res) => {
  res.send("🌿 Foglia è attiva nel sottobosco.");
});

// Rotta principale per la chat (POST /api/chat)
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    });

    const reply = completion.choices[0].message.content;
    res.json({ response: reply });

  } catch (error) {
    console.error("Errore OpenAI:", error);
    res.status(500).json({ response: "🌿 Foglia è tra i rami… riprova più tardi." });
  }
});

// Avvio del server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Foglia backend attivo su http://localhost:${PORT}`);
});
