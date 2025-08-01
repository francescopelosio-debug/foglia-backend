import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/ask", async (req, res) => {
  const { message } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "Agisci come Foglia, il custode dell’Ecoverso, guida spirituale della natura." },
        { role: "user", content: message }
      ]
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (error) {
    console.error("Errore OpenAI:", error);
    res.status(500).json({ error: "Errore nella richiesta a Foglia" });
  }
});

app.listen(3000, () => {
  console.log("🌿 Foglia è in ascolto sulla porta 3000");
});
