// ===== Foglia • Frontend engine (usa proxy WP per la chat) =====
(() => {
  // --- ENDPOINTS ---
  const CHAT_API    = '/wp-json/foglia/v1/chat';             // proxy WP (niente CORS)
  const ANALYZE_API = 'https://foglia-ai.onrender.com/api/analyze'; // upload PDF/DOCX (opzionale)

  // --- HOOK DOM ---
  const $   = sel => document.querySelector(sel);
  const box = $('#foglia-box');
  const msgs= $('#foglia-messages');
  const input = $('#foglia-input');
  const send  = $('#foglia-send');
  const upBtn = $('#foglia-upload');
  const fileI = $('#foglia-file');
  const toggle = $('#foglia-toggle-mini');
  const closeB = $('#foglia-close');
  if(!box || !msgs || !input || !send) return;

  // --- UTILS ---
  const esc = s => String(s ?? '').replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  const add  = (who, text) => {
    msgs.insertAdjacentHTML('beforeend',
      `<div style="margin:8px 0"><strong>${who}:</strong> ${esc(text).replace(/\n/g,'<br>')}</div>`);
    msgs.scrollTop = msgs.scrollHeight;
  };
  const typing = () => {
    const el = document.createElement('div');
    el.className = 'foglia-typing';
    el.innerHTML = '<strong>Foglia:</strong> <span class="dot">•</span><span class="dot">•</span><span class="dot">•</span>';
    msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight;
    return () => el.remove();
  };
  const postJSON = async (url, body) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const raw = await r.text();
    let data; try { data = JSON.parse(raw); } catch { data = { response: raw }; }
    if(!r.ok) throw new Error(data?.error || ('HTTP '+r.status));
    // normalizza i diversi possibili payload
    return (typeof data === 'string')
      ? data
      : (data.response || data.content || data?.message?.content || data?.choices?.[0]?.message?.content || '');
  };

  // --- GREETING BOSCHIVO (una volta) ---
  function greeting(){
    const tz='Europe/Rome', now=new Date();
    const fmt=new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:tz}).format(now);
    const hour=+new Intl.DateTimeFormat('it-IT',{hour:'2-digit',hour12:false,timeZone:tz}).format(now);
    const momento = hour<6?'notte':hour<12?'mattina':hour<18?'pomeriggio':'sera';
    const y=now.getUTCFullYear();
    const d=(m,day)=>new Date(Date.parse(`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}T00:00:00Z`));
    const s=d(6,21), a=d(9,22), i=d(12,21), p=d(3,20);
    let stag='inverno', frase='tempo di riposo e radici silenziose';
    if(now>=p && now<s){ stag='primavera'; frase='giorni di germogli e acqua chiara'; }
    else if(now>=s && now<a){ stag='estate'; frase='luce lunga e sentieri profumati di resina'; }
    else if(now>=a && now<i){ stag='autunno'; frase='foglie dorate e passi più attenti'; }
    add('Foglia', `🌿 Oggi è **${fmt}**, una **${momento}** di **${stag}**: ${frase}. Dimmi pure come posso aiutarti.`);
  }

  // --- APRI/CHIUDI ---
  function openBox(){ box.style.display='block'; if(toggle) toggle.style.display='none'; if(!window.__fogliaGreeted){ greeting(); window.__fogliaGreeted=true; } }
  function closeBox(){ box.style.display='none'; if(toggle) toggle.style.display=''; }
  toggle?.addEventListener('click', openBox);
  closeB?.addEventListener('click', closeBox);
  document.addEventListener('keydown', e => { if(e.key==='Escape') closeBox(); });
  document.addEventListener('click', e => { if (box.style.display==='block' && !box.contains(e.target) && !toggle?.contains(e.target)) closeBox(); });

  // --- INVIO MESSAGGIO ---
  async function sendMsg(){
    const text = input.value.trim(); if(!text) return;
    add('Tu', text); input.value='';
    const stop = typing();
    try{
      // usa proxy WP (niente CORS)
      const reply = await postJSON(CHAT_API, { prompt: text });
      stop(); add('Foglia', reply || '…nessuna risposta.');
    }catch(e){
      stop(); add('Foglia', 'Errore 404: impossibile contattare il bosco.');
    }
  }
  send.addEventListener('click', sendMsg);
  input.addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMsg(); } });

  // --- UPLOAD (opzionale, passa dal backend Render) ---
  if (upBtn && fileI){
    upBtn.addEventListener('click', () => fileI.click());
    fileI.addEventListener('change', async () => {
      const f = fileI.files?.[0]; if(!f) return;
      add('Tu', `Ho caricato ${f.name}.`);
      const fd = new FormData(); fd.append('file', f, f.name);
      const stop = typing();
      try{
        const r = await fetch(ANALYZE_API, { method:'POST', body: fd });
        const raw = await r.text();
        let data; try { data = JSON.parse(raw); } catch { data = { response: raw }; }
        stop(); add('Foglia', data.response || 'Nessuna risposta.');
      }catch(e){
        stop(); add('Foglia', '❌ Errore durante l’analisi del file.');
      }finally{
        fileI.value = '';
      }
    });
  }

  // --- micro-CSS per i puntini ---
  if(!document.getElementById('foglia-typing-css')){
    const s=document.createElement('style'); s.id='foglia-typing-css';
    s.textContent = `.foglia-typing .dot{display:inline-block;animation:fblink 1.2s infinite}
      .foglia-typing .dot:nth-child(2){animation-delay:.15s}
      .foglia-typing .dot:nth-child(3){animation-delay:.3s}
      @keyframes fblink{0%,60%,100%{opacity:.2}30%{opacity:1}}`;
    document.head.appendChild(s);
  }
})();
