// index.js (ESM) – Foglia backend robusto per Render
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import morgan from 'morgan';
import multer from 'multer';
import mammoth from 'mammoth';

dotenv.config();

/* ===== Config ===== */
const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';         // es: "https://ecoverso.ecoverso.earth"
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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

/* ===== Docs ufficiali (default) ===== */
const FOGLIA_DOCS_DEFAULT = [
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/che-cosa-e-ecoverso.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/checklist-attivita-prodotti.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/guida-vendor-custodi.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/linee-guida-foglia.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/manifesto-ecoverso.pdf',
  'https://ecoverso.ecoverso.earth/wp-content/uploads/foglia/trasparenza-ecoverso.pdf'
];

/* ===== Persona (druido custode) con output JSON ===== */
function buildSystemPrompt(){
  return `
Sei “Foglia”, druida custode dei boschi. Tono: caldo, incoraggiante, ma pratico.
Parla in italiano semplice. Una sola emoji naturale dove ha senso (🌿, 🪵, 🌲).

Quando VALUTI, restituisci PRIMA un JSON **valido** (nessun testo extra):
{
 "decision": "approved" | "approved_with_recs" | "changes" | "rejected",
 "motivation": "1 frase concreta (max 30 parole)",
 "missing_fields": ["campo mancante o vago", "..."],
 "concrete_suggestions": [
   "suggerimento pratico e pronto da copiare",
   "altri 1-3 suggerimenti azionabili"
 ]
}

Regole:
- Se i campi chiave ci sono (titolo, luogo, durata, attività) ⇒ preferisci "approved_with_recs" con 2–4 raccomandazioni concrete.
- “Modifiche necessarie” solo se mancano elementi essenziali (sicurezza/mitigazione/permessi) o ci sono affermazioni fuorvianti.
- Frasi specifiche, non vaghe.

Libreria di suggerimenti (riusa quando utile, riformula se serve):
- Mitigazione/Leave No Trace: "Rimaniamo sui sentieri, non raccogliamo fiori o funghi, riportiamo i rifiuti, evitiamo rumori forti; il gruppo è diviso in sottogruppi da max 12."
- Fauna: "Osserviamo gli animali a distanza senza alimentarli né avvicinarli; sostiamo lontano da nidi e tane."
- Sicurezza: "Briefing iniziale su abbigliamento, meteo e acqua; kit primo soccorso e piano emergenze con punto di ritrovo."
- Accessibilità: "Percorso senza tratti esposti; variante pianeggiante di 800 m per chi ha necessità."
- Assicurazione: "Attività coperta da polizza RC Guida n. ____ (massimale ___); documento consultabile su: https://…"
- Permessi: "Evento comunicato a Comune/Parco in data __; rispetto del regolamento locale."
- Meteo: "In caso di maltempo rinvio entro 48 h o variante bosco riparato."
- Gruppi/bambini: "Rapporto guida/bambini 1:10; adulti accompagnatori informati e responsabili."

Dopo il JSON NON scrivere altro. Niente chiacchiere: solo JSON.
`.trim();
}

/* ===== Templates rapidi ===== */
const FOGLIA_TEMPLATES = {
  cos_e:
    "Ecoverso è un luogo dove attività nella natura, prodotti responsabili e progetti di rigenerazione si incontrano. Lavoriamo con trasparenza, comunità e cura del territorio."
};

/* ===== Helpers ===== */
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

async function askOpenAI(messages, model = OPENAI_MODEL, temperature = 0.2) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY mancante');
  const resp = await openai.chat.completions.create({ model, temperature, messages });
  return resp?.choices?.[0]?.message?.content || '';
}

function safeParseJSON(s){
  try { return JSON.parse(s) } catch { return null }
}

function renderFogliaReply(v){
  const icon = v.decision === 'approved' ? '✅'
             : v.decision === 'approved_with_recs' ? '✅'
             : v.decision === 'changes' ? '⚠'
             : '❌';

  const title =
    v.decision === 'approved' ? 'Approvato'
  : v.decision === 'approved_with_recs' ? 'Approvato con raccomandazioni'
  : v.decision === 'changes' ? 'Modifiche necessarie'
  : 'Rifiutato';

  const missing = (v.missing_fields || []).map(x => `• ${x}`).join('\n');
  const recs    = (v.concrete_suggestions || []).map(x => `• ${x}`).join('\n');

  let out = `🌿 *${title}* — ${v.motivation}\n`;
  if (missing) out += `\n*Da chiarire:*\n${missing}\n`;
  if (recs)    out += `\n*Puoi incollare subito:*\n${recs}\n`;
  out += `\n🪵 Se vuoi, posso generare io un paragrafo pronto con questi punti.`;
  return out;
}

function buildReviewPrompt(content, docs){
  const docsList = docs.map(u => `- ${u}`).join('\n');
  return `
Documenti di riferimento (policy Ecoverso):
${docsList}

Contenuto da valutare:
${content}

Nota: se i campi chiave sono presenti, preferisci "approved_with_recs" con 2–4 suggerimenti copiabili invece di "changes".
`.trim();
}

/* --- import "lazy" di pdf-parse per evitare ENOENT su Render --- */
let pdfParseFn = null;
async function getPdfParse() {
  if (pdfParseFn) return pdfParseFn;
  try {
    const mod = await import('pdf-parse/lib/pdf-parse.js'); // build “lib”
    pdfParseFn = mod.default || mod;
  } catch {
    const mod = await import('pdf-parse'); // fallback
    pdfParseFn = mod.default || mod;
  }
  return pdfParseFn;
}

/* ===== Healthcheck ===== */
app.get('/', (_req, res) => res.send('🌿 Foglia è attiva nel sottobosco.'));

/* ===== Chat =====
   - se il prompt inizia con "valutare:" → usa pipeline strutturata (JSON)
   - altrimenti risposta conversazionale semplice
*/
app.post('/api/chat', async (req, res) => {
  try {
    const promptRaw = String(req.body?.prompt || '').slice(0, 15000);
    const docs = normalizeDocs(req.body?.docs);

    // quick intent
    const low = promptRaw.toLowerCase();
    if (low.includes("cos'è ecoverso") || low.includes("cos e ecoverso")) {
      return res.json({ response: FOGLIA_TEMPLATES.cos_e });
    }

    // --- modalità valutazione ---
    if (low.trim().startsWith('valutare:')) {
      const content = promptRaw.replace(/^valutare:\s*/i,'').trim();
      const messages = [
        { role: 'system', content: buildSystemPrompt() },
        // few-shot: esempio breve
        { role: 'user', content: 'Proposta: Titolo: Passeggiata nel bosco; Luogo: Parco X; Durata: 1h; Attività: osservazione foglie; Sicurezza: briefing e kit PS; ' },
        { role: 'assistant', content: JSON.stringify({
          decision: "approved_with_recs",
          motivation: "Proposta completa e in linea con le linee guida.",
          missing_fields: [],
          concrete_suggestions: [
            "Includi la frase: “Rapporto guida/bambini 1:10; adulti informati e responsabili”.",
            "Aggiungi: “In caso di maltempo rinvio entro 48 h o variante bosco riparato”."
          ]
        })},
        { role: 'user', content: buildReviewPrompt(content, docs) }
      ];

      const raw = await askOpenAI(messages);
      const parsed = safeParseJSON(raw);
      const pretty = (parsed?.decision && parsed?.motivation)
        ? renderFogliaReply(parsed)
        : raw || 'Nessuna risposta dal Custode.';

      return res.json({ response: pretty, structured: parsed || null });
    }

    // --- chat “normale” ---
    const docsList = docs.map(u => `- ${u}`).join('\n');
    const user = `
Documenti di riferimento (policy Ecoverso):
${docsList}

Richiesta:
${promptRaw}

Tono: druido custode, caldo e concreto (una sola immagine naturale al massimo).
`.trim();

    const content = await askOpenAI([
      { role: 'system', content: `
Sei “Foglia”, guida gentile dell’Ecoverso. Rispondi breve (3–5 frasi), pratico e accogliente. Emoji naturali con parsimonia.
` },
      { role: 'user', content: user }
    ]);

    res.json({ response: content || 'Nessuna risposta.' });
  } catch (err) {
    console.error('Errore /api/chat:', err);
    res.status(500).json({ error: 'Errore interno.' });
  }
});

/* ===== Analisi file (PDF/DOCX/TXT/MD) con valutazione strutturata ===== */
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File mancante.' });

    const name = (req.file.originalname || '').toLowerCase();
    const mime = req.file.mimetype || '';
    let extractedText = '';

    if (mime.includes('pdf') || name.endsWith('.pdf')) {
      const pdfParse = await getPdfParse();
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

    extractedText = extractedText.trim().slice(0, 30000);
    if (!extractedText) return res.status(422).json({ error: 'Impossibile estrarre testo dal file.' });

    const docs = normalizeDocs(req.body?.docs);
    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildReviewPrompt(extractedText, docs) }
    ];

    const raw = await askOpenAI(messages);
    const parsed = safeParseJSON(raw);
    const pretty = (parsed?.decision && parsed?.motivation)
      ? renderFogliaReply(parsed)
      : raw || 'Nessuna risposta dal Custode.';

    res.json({ response: pretty, structured: parsed || null });
  } catch (err) {
    console.error('Errore /api/analyze:', err);
    res.status(500).json({ error: 'Errore interno durante l’analisi.' });
  }
});

/* ===== /api/proposal (stub RAM) =====
   - per ora non salva su WP: risponde ok così il frontend può testare
*/
const PROPOSALS = [];
app.post('/api/proposal', async (req, res) => {
  try {
    const { title, content } = req.body || {};
    const id = String(Date.now());
    PROPOSALS.push({ id, title: title || '(senza titolo)', content: content || '', ts: new Date().toISOString() });
    return res.json({ ok: true, id, edit_link: null });
  } catch (e) {
    console.error('Errore /api/proposal:', e);
    res.status(500).json({ error: 'Impossibile salvare la proposta (stub).' });
  }
});

/* ===== Start ===== */
app.listen(PORT, () => {
  console.log(`✅ Foglia backend attivo su :${PORT}`);
});
