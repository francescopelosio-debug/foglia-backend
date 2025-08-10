// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import morgan from 'morgan';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

dotenv.config();

/* ------------ Config ------------- */
const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'; // es: "https://ecoverso.ecoverso.earth"

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

// upload in RAM (Render non ha storage persistente)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB
});

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ------------ Costanti Foglia ------------- */
const FOGLIA_DOCS_DEFAULT = [
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/che-cosa-e-ecoverso.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/checklist-attivita-prodotti.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/guida-vendor-custodi.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/linee-guida-foglia.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/manifesto-ecoverso.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/trasparenza-ecoverso.pdf'
];

const FOGLIA_SYSTEM = `
Sei “Foglia”, un* druido* custode dei boschi di Ecoverso: una presenza calma, saggia e concreta.
Identità:
- Guardiana della natura: proteggi coerenza, verità e rispetto.
- Tono: caldo, essenziale, contemplativo; mai pomposo. Frasi brevi, immagini naturali sobrie.
- Lessico: natura, cura, sentieri, semi, radici, vento, luce, acqua. Evita retorica e slogan.
- Ritmo: rispondi in modo pratico ma con un tocco poetico (1 frase immagine max), poi vai al punto.

Compito:
- Informare su Ecoverso con chiarezza.
- Valutare contenuti/prodotti rispetto ai documenti ufficiali (URL forniti nel prompt utente).
- Restituire un esito tra: ✅ Approvato, ⚠ Modifiche necessarie, ❌ Rifiutato.
- Motivare sempre in modo breve e utile.

Stile & regole:
- Gentile ma fermo: “ti accompagno”, non “ti comando”.
- Zero greenwashing: contesta affermazioni vaghe; chiedi prove.
- Accessibilità: linguaggio semplice; niente gergo tecnico non essenziale.
- Emojis limitate (🌿, ✨, 🪵) e solo per orientare, mai sostituire il contenuto.
- Niente iperboli (“il migliore al mondo”, “rivoluzionario”).
- Quando non sai, chiedi un dettaglio specifico (es. luogo, data, fonti).

Formato delle valutazioni (obbligatorio):
- ✅ Approvato – motivazione breve
- ⚠ Modifiche necessarie – elenco puntato sintetico (3 punti max)
- ❌ Rifiutato – motivazione breve + 1 consiglio per riallineare

Se l’utente saluta: breve benvenuto druidico e proposta di aiuto (“vuoi sapere cos’è Ecoverso o vuoi una valutazione?”).
Ricorda: concretezza prima, poesia dopo.
`.trim();

/* ------------ Helpers ------------- */
async function askOpenAI(messages, model = 'gpt-4o-mini', temperature = 0.2) {
  const resp = await openai.chat.completions.create({ model, messages, temperature });
  return resp?.choices?.[0]?.message?.content || 'Nessuna risposta.';
}

/* ------------ Health ------------- */
app.get('/', (_req, res) => {
  res.send('🌿 Foglia è attiva nel sottobosco.');
});

/* ------------ Chat semplice ------------- */
app.post('/api/chat', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').slice(0, 12000);

    // opzionale: docs passati dal client, altrimenti default
    const docs = Array.isArray(req.body?.docs) ? req.body.docs : FOGLIA_DOCS_DEFAULT;
    const docsList = docs.map(u => `- ${u}`).join('\n');

    const user = `Documenti di riferimento (policy):
${docsList}

Richiesta:
${prompt}`;

    const content = await askOpenAI([
      { role: 'system', content: FOGLIA_SYSTEM },
      { role: 'user', content: user }
    ]);

    res.json({ response: content });
  } catch (err) {
    console.error('Errore /api/chat:', err);
    res.status(500).json({ error: 'Errore interno.' });
  }
});

/* ------------ Analisi file (PDF/DOCX/TXT/MD) ------------- */
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante.' });

    const name = (req.file.originalname || '').toLowerCase();
    const mime = req.file.mimetype || '';
    let extractedText = '';

    if (mime.includes('pdf') || name.endsWith('.pdf')) {
      const parsed = await pdfParse(req.file.buffer);
      extractedText = parsed.text || '';
    } else if (mime.includes('wordprocessingml') || name.endsWith('.docx')) {
      const { value } = await mammoth.extractRawText({ buffer: req.file.buffer });
      extractedText = value || '';
    } else if (mime.includes('text') || name.endsWith('.txt') || name.endsWith('.md')) {
      extractedText = req.file.buffer.toString('utf8');
    } else {
      return res.status(415).json({ error: 'Formato non supportato. Usa PDF, DOCX, TXT o MD.' });
    }

    extractedText = extractedText.trim().slice(0, 30000); // safety

    // docs opzionali passati dal client (stringa JSON o array)
    let docs = FOGLIA_DOCS_DEFAULT;
    try {
      if (req.body?.docs) {
        const parsed = Array.isArray(req.body.docs) ? req.body.docs : JSON.parse(req.body.docs);
        if (Array.isArray(parsed) && parsed.length) docs = parsed;
      }
    } catch {}

    const docsList = docs.map(u => `- ${u}`).join('\n');

    const userPrompt = `Documenti di riferimento (policy):
${docsList}

Contenuto da valutare (estratto dal file "${req.file.originalname}"):
${extractedText}

Fornisci SOLO uno dei seguenti formati:
- ✅ Approvato – motivazione breve
- ⚠ Modifiche necessarie – elenco breve
- ❌ Rifiutato – motivazione breve`;

    const content = await askOpenAI([
      { role: 'system', content: FOGLIA_SYSTEM },
      { role: 'user', content: userPrompt }
    ]);

    res.json({ response: content });
  } catch (err) {
    console.error('Errore /api/analyze:', err);
    res.status(500).json({ error: 'Errore interno durante l’analisi.' });
  }
});

/* ------------ Start ------------- */
app.listen(PORT, () => {
  console.log(`✅ Foglia backend attivo su :${PORT}`);
});
