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

// === TEMPLATES FISSI (risposte istantanee) ===
const FOGLIA_TEMPLATES = {
  benvenuto: "🌿 Saluti, viandante. Io sono Foglia, druida custode dei boschi e guardiana dell’Ecoverso. Posso narrarti cos’è Ecoverso o valutare un contenuto per te.",
  cos_e: "🌿 Ecoverso è un rifugio digitale dove le radici della natura incontrano il passo dell’uomo. Qui si raccolgono attività nella natura, progetti di rigenerazione, prodotti responsabili e storie che nutrono la Terra.",
  approvato: "✅ Approvato – il contenuto è armonico con la natura e coerente con le nostre linee guida. Porta beneficio e chiarezza.",
  modifiche: "⚠ Modifiche necessarie – il contenuto necessita di chiarezza aggiuntiva o prove dell’impatto positivo. Rivedi i dettagli.",
  rifiutato: "❌ Rifiutato – il contenuto non rispetta i principi di sostenibilità o contiene elementi fuorvianti."
};

// === SYSTEM PROMPT BASE ===
const FOGLIA_SYSTEM = `
Sei “Foglia”, druida custode dei boschi e guida dell’Ecoverso.
Parli con un tono poetico ma chiaro, come una presenza vegetale che sussurra consigli e verità.
Valuti contenuti in base a:
- Pertinenza con natura e sostenibilità
- Linguaggio rispettoso, chiaro, non aggressivo
- Assenza di greenwashing o promesse infondate

Se ti viene chiesto di valutare, usa SOLO uno di questi formati:
- ✅ Approvato – motivazione breve
- ⚠ Modifiche necessarie – elenco breve
- ❌ Rifiutato – motivazione breve

Puoi anche rispondere a curiosità sull’Ecoverso e i suoi progetti.
`.trim();

// Rotta test per Render
app.get('/', (req, res) => {
  res.send("🌿 Foglia veglia su questo luogo.");
});

// === Rotta principale ===
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    const userText = prompt?.toLowerCase() || '';

    // 1. Risposte istantanee
    if (userText.includes("cos'è ecoverso") || userText.includes("cos e ecoverso")) {
      return res.json({ response: FOGLIA_TEMPLATES.cos_e });
    }
    if (userText.startsWith("valutare:")) {
      // Simuliamo approvazione/rifiuto demo
      if (userText.includes("bosco") || userText.includes("sostenibile")) {
        return res.json({ response: FOGLIA_TEMPLATES.approvato });
      } else {
        return res.json({ response: FOGLIA_TEMPLATES.rifiutato });
      }
    }

    // 2. Chiamata a OpenAI per il resto
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: FOGLIA_SYSTEM },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    });

    const reply = completion.choices[0].message.content;
    res.json({ response: reply });

  } catch (error) {
    console.error("Errore OpenAI:", error);
    res.status(500).json({ response: "🌿 Foglia è tra i rami… riprova più tardi." });
  }
});

// Avvio server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Foglia backend attivo su http://localhost:${PORT}`);
});
