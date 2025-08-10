// index.js (ESM) – versione robusta per Render
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import morgan from 'morgan';
import multer from 'multer';
// ⛔️ niente import diretto di pdf-parse qui (causa ENOENT in alcuni ambienti)
import mammoth from 'mammoth';

dotenv.config();

/* ===== Config ===== */
const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'; // es: "https://ecoverso.ecoverso.earth"

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

// Upload in RAM (Render non ha storage persistente)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

// OpenAI
if (!process.env.OPENAI_API_KEY) {
  console.warn('[WARN] OPENAI_API_KEY non definita: /api/* risponderà 500.');
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ===== Docs ufficiali ===== */
const FOGLIA_DOCS_DEFAULT = [
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/che-cosa-e-ecoverso.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/checklist-attivita-prodotti.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/guida-vendor-custodi.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/linee-guida-foglia.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/manifesto-ecoverso.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/trasparenza-ecoverso.pdf'
];

/* ===== Persona (druido custode) ===== */
const FOGLIA_SYSTEM = `
Sei “Foglia”, druida custode dei boschi e guida dell’Ecoverso.
Stile: caldo, essenziale, contemplativo; 1 sola immagine naturale al massimo per messaggio.
Lessico sobrio (radici, sentieri, luce, acqua), niente slogan o iperboli.

Compiti:
- Informare su Ecoverso con chiarezza.
- Valutare contenuti/prodotti in base ai documenti ufficiali (URL forniti).
- Restituire un esito tra: ✅ Approvato, ⚠ Modifiche necessarie, ❌ Rifiutato, con motivazione breve.

Regole:
- Zero greenwashing: contesta affermazioni vaghe; chiedi prove se mancano.
- Accessibilità: linguaggio semplice; niente gergo non necessario.
- Emojis: usa con parsimonia (🌿 ✨ 🪵).
- Quando non sai, chiedi 1 dettaglio pratico (es. luogo, data, prova impatto).

Formato valutazioni (obbligatorio):
- ✅ Approvato – motivazione breve
- ⚠ Modifiche necessarie – elenco breve (max 3 punti)
- ❌ Rifiutato – motivazione breve + 1 consiglio
`.trim();

/* ===== Risposte istantanee utili ===== */
const FOGLIA_TEMPLATES = {
  benvenuto:
    "🌿 Ciao, sono Foglia. Vuoi sapere cos’è Ecoverso o preferisci che valuti un contenuto? Puoi anche caricare un file.",
  cos_e:
    "Ecoverso è un luogo dove attività nella natura, prodotti responsabili e progetti di rigenerazione si incontrano. Lavoriamo con trasparenza, comunità e cura del territorio."
};

/* ===== Helpers ===== */
async function askOpenAI(messages, model = 'gpt-4o-mini', temperature = 0.2) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY mancante');
  }
  const resp = await openai.chat.completions.create({ model, temperature, messages });
  return resp?.choices?.[0]?.message?.content || 'Nessuna risposta.';
}

function normalizeDocs(docsInBody) {
  try {
    if (!docsInBody) return FOGLIA_DOCS_DEFAULT;
    if (Array.isArray(docsInBody)) return docsInBody.length ? docsInBody : FOGLIA_DOCS_DEFAULT;
    const parsed = JSON.parse(docsInBody);
    return Array.isArray(parsed) && parsed.length ? parsed : FOGLIA_DOCS_DEFAULT;
  } catch {
    return FOGLIA_DOCS_DEFAULT;
  }
}

/* --- import "lazy" di pdf-parse per evitare ENOENT in ambiente serverless --- */
let pdfParseFn = null;
async function getPdfParse() {
  if (pdfParseFn) return pdfParseFn;
  try {
    // build "lib" → niente side-effect di test
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    pdfParseFn = mod.default || mod;
  } catch {
    // fallback al pacchetto root
    const mod = await import('pdf-parse');
    pdfParseFn = mod.default || mod;
  }
  return pdfParseFn;
}

/* ===== Healthcheck ===== */
app.get('/', (_req, res) => res.send('🌿 Foglia è attiva nel sottobosco.'));

/* ===== Chat (testo libero) ===== */
app.post('/api/chat', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').slice(0, 12000);
    const docs = normalizeDocs(req.body?.docs);
    const docsList = docs.map(u => `- ${u}`).join('\n');

    // risposte istantanee utili (opzionali)
    const low = prompt.toLowerCase();
    if (low.includes("cos'è ecoverso") || low.includes("cos e ecoverso")) {
      return res.json({ response: FOGLIA_TEMPLATES.cos_e });
    }

    const user = `Documenti di riferimento (policy Ecoverso):
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

/* ===== Analisi file (PDF/DOCX/TXT/MD) ===== */
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante.' });

    const name = (req.file.originalname || '').toLowerCase();
    const mime = req.file.mimetype || '';
    let extractedText = '';

    if (mime.includes('pdf') || name.endsWith('.pdf')) {
      const pdfParse = await getPdfParse();       // <— lazy import
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
    if (!extractedText) {
      return res.status(422).json({ error: 'Impossibile estrarre testo dal file.' });
    }

    const docs = normalizeDocs(req.body?.docs);
    const docsList = docs.map(u => `- ${u}`).join('\n');

    const userPrompt = `Documenti di riferimento (policy Ecoverso):
${docsList}

Contenuto da valutare (estratto dal file "${req.file.originalname}"):
${extractedText}

Fornisci SOLO uno dei seguenti formati:
- ✅ Approvato – motivazione breve
- ⚠ Modifiche necessarie – elenco breve (max 3 punti)
- ❌ Rifiutato – motivazione breve + 1 consiglio`;

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

/* ===== Start ===== */
app.listen(PORT, () => {
  console.log(`✅ Foglia backend attivo su :${PORT}`);
});
