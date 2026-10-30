"use strict";
/* ============ Seção Diálogos ============
   Exemplo: voz feminina pergunta, voz masculina responde (MP3 gerados por tools/build_dialogs.py).
   Prática: você fala a resposta frase por frase e recebe nota de
   pronúncia (reconhecimento de voz), fluência (ritmo e pausas) e entonação (melodia da voz),
   as duas últimas comparando a sua gravação com a do modelo. */

const DLG_LANG = "en-US";
const DLG = {ctx:null, refs:{}, player:null, cap:null, stream:null, src:null};

function dlgStats(){ DB.dlgStats = DB.dlgStats || {}; return DB.dlgStats; }
function dlgAudioOn(){ return DB.settings.dlgAudio !== false; }
function allDialogs(){ return DIALOG_SETS.flatMap(s => s.dialogs.map(d => Object.assign({set:s}, d))); }

/* ---------- áudio ---------- */
function audioCtx(){
  if (!DLG.ctx){ const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; DLG.ctx = new AC(); }
  if (DLG.ctx.state === "suspended") DLG.ctx.resume();
  return DLG.ctx;
}
function stopPlayer(){
  if (DLG.player){ try{ DLG.player.pause(); }catch(e){} DLG.player.onended = null; DLG.player = null; }
  if (DLG.srcNode){ try{ DLG.srcNode.stop(); }catch(e){} DLG.srcNode = null; }
}
function playFile(url){
  stopPlayer(); if (synth) synth.cancel();
  return new Promise(res => {
    const a = new Audio(url); DLG.player = a;
    let done = false; const fin = () => { if (!done){ done = true; res(); } };
    a.onended = fin; a.onerror = fin; a.onpause = fin;
    a.play().catch(fin);
  });
}
function playSamples(samples, sr){
  const ctx = audioCtx(); if (!ctx || !samples) return;
  stopPlayer();
  const buf = ctx.createBuffer(1, samples.length, sr); buf.getChannelData(0).set(samples);
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(); DLG.srcNode = src;
}
function decode(ab){
  const ctx = audioCtx();
  return new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
}
async function refAnalysis(url){
  if (DLG.refs[url]) return DLG.refs[url];
  const p = (async () => {
    const ab = await (await fetch(url)).arrayBuffer();
    const buf = await decode(ab);
    return analyzeSpeech(buf.getChannelData(0), buf.sampleRate);
  })();
  DLG.refs[url] = p;
  p.catch(() => { delete DLG.refs[url]; });
  return p;
}

/* ---------- análise do sinal: atividade de voz, pausas e altura (pitch) ---------- */
const AN_SR = 16000, AN_HOP = 320, AN_WIN = 640; // 20 ms de passo, 40 ms de janela
function resample(x, sr){
  if (sr === AN_SR) return x;
  const ratio = sr / AN_SR, n = Math.floor(x.length / ratio), y = new Float32Array(n), w = Math.max(1, Math.round(ratio));
  for (let i=0;i<n;i++){ const s = Math.floor(i*ratio); let acc = 0, c = 0;
    for (let k=0;k<w && s+k<x.length;k++){ acc += x[s+k]; c++; } y[i] = acc / c; }
  return y;
}
function pct(arr, p){ const a = Array.from(arr).sort((x,y)=>x-y); return a[Math.min(a.length-1, Math.floor(p*a.length))] || 0; }
function analyzeSpeech(raw, sr){
  const x = resample(raw, sr);
  const nF = Math.max(0, Math.floor((x.length - AN_WIN) / AN_HOP));
  const rms = new Float32Array(nF);
  for (let f=0; f<nF; f++){ let s = 0, o = f*AN_HOP; for (let i=0;i<AN_WIN;i++){ const v = x[o+i]; s += v*v; } rms[f] = Math.sqrt(s/AN_WIN); }
  if (nF < 5) return null;
  const noise = pct(rms, 0.15), peak = pct(rms, 0.95);
  const thr = Math.max(noise*2.5, peak*0.12, 0.004);
  const sp = Array.from(rms, v => v > thr);
  // preenche buracos menores que 160 ms (entre sílabas)
  for (let f=0; f<nF; f++) if (!sp[f]){ let j = f; while (j<nF && !sp[j]) j++;
    if (f>0 && j<nF && (j-f) <= 8) for (let k=f;k<j;k++) sp[k] = true; f = j; }
  let start = sp.indexOf(true), end = sp.lastIndexOf(true);
  if (start < 0) return {dur:0, pauses:[], contour:[], start:0, end:0, voiced:0};
  const pauses = [];
  for (let f=start; f<=end; f++) if (!sp[f]){ let j = f; while (j<=end && !sp[j]) j++; pauses.push((j-f)*AN_HOP/AN_SR); f = j; }
  // pitch por autocorrelação normalizada (70–400 Hz)
  const minLag = Math.floor(AN_SR/400), maxLag = Math.floor(AN_SR/70);
  const contour = [];
  let voiced = 0;
  for (let f=start; f<=end; f++){
    if (!sp[f] || rms[f] < thr*1.2){ contour.push(null); continue; }
    const o = f*AN_HOP, r = new Float32Array(maxLag+1);
    let best = 0;
    for (let l=minLag; l<=maxLag; l++){
      let s = 0, e1 = 0, e2 = 0;
      for (let i=0; i<AN_WIN-l; i++){ const a = x[o+i], b = x[o+i+l]; s += a*b; e1 += a*a; e2 += b*b; }
      r[l] = s / (Math.sqrt(e1*e2) || 1); if (r[l] > best) best = r[l];
    }
    if (best < 0.5){ contour.push(null); continue; }
    let lag = minLag; // menor atraso perto do máximo, evita erro de oitava
    for (let l=minLag+1; l<maxLag; l++) if (r[l] >= best*0.9 && r[l] >= r[l-1] && r[l] >= r[l+1]){ lag = l; break; }
    contour.push(AN_SR / lag); voiced++;
  }
  const hz = contour.filter(v => v);
  const med = hz.length ? pct(hz, 0.5) : 1;
  const st = contour.map(v => v ? 12*Math.log2(v/med) : null).map(v => v != null && Math.abs(v) > 12 ? null : v);
  return {dur:(end-start+1)*AN_HOP/AN_SR, pauses, contour:st, start, end, voiced};
}
function shape(contour, N){
  const bins = Array.from({length:N}, () => []);
  contour.forEach((v,i) => { if (v != null) bins[Math.min(N-1, Math.floor(i*N/contour.length))].push(v); });
  let y = bins.map(b => b.length ? b.reduce((a,c)=>a+c,0)/b.length : null);
  const have = y.filter(v => v != null).length;
  if (have < N*0.3) return null;
  // interpola os buracos
  let last = -1;
  for (let i=0;i<N;i++) if (y[i] != null){
    if (last < 0) for (let k=0;k<i;k++) y[k] = y[i];
    else for (let k=last+1;k<i;k++) y[k] = y[last] + (y[i]-y[last])*(k-last)/(i-last);
    last = i;
  }
  for (let k=last+1;k<N;k++) y[k] = y[last];
  y = y.map((v,i) => { const w = [y[i-1],v,y[i+1]].filter(z => z != null).sort((a,b)=>a-b); return w[Math.floor(w.length/2)]; });
  const m = y.reduce((a,c)=>a+c,0)/N;
  return y.map(v => v - m);
}
function intonationScore(ref, usr){
  if (!ref || !usr) return null;
  const N = 40, a = shape(ref.contour, N), b = shape(usr.contour, N);
  if (!a || !b) return null;
  const sd = v => Math.sqrt(v.reduce((s,x)=>s+x*x,0)/v.length);
  const sa = sd(a), sb = sd(b);
  const r = (sa && sb) ? a.reduce((s,x,i)=>s+x*b[i],0) / (N*sa*sb) : 0;
  const corr = Math.max(0, Math.min(1, (r + 0.1) / 0.8)) * 100;
  const ratio = sa ? sb/sa : 1;
  const range = ratio < 0.8 ? Math.max(0, ratio/0.8)*100 : ratio > 2 ? Math.max(40, 100-(ratio-2)*40) : 100;
  const endA = a.slice(-5).reduce((s,x)=>s+x,0)/5 - a.slice(24,34).reduce((s,x)=>s+x,0)/10;
  const endB = b.slice(-5).reduce((s,x)=>s+x,0)/5 - b.slice(24,34).reduce((s,x)=>s+x,0)/10;
  const fin = (Math.abs(endA) < 0.7 || Math.sign(endA) === Math.sign(endB)) ? 100 : 35;
  return {score: Math.round(0.6*corr + 0.25*range + 0.15*fin), r, ratio, flat: ratio < 0.5, endWrong: fin < 100,
          refUp: endA > 0.7};
}
function fluencyScore(ref, usr){
  if (!ref || !usr || !usr.dur) return null;
  const ratio = usr.dur / ref.dur;
  let s = ratio <= 1.25 ? (ratio < 0.65 ? 85 : 100)
        : ratio <= 2 ? 100 - (ratio-1.25)/0.75*50
        : Math.max(20, 50 - (ratio-2)*30);
  const big = p => p.filter(x => x >= 0.45).length;
  const extra = Math.max(0, big(usr.pauses) - big(ref.pauses));
  const long = usr.pauses.filter(x => x >= 1.0).length;
  s -= extra*10 + long*8;
  return {score: Math.round(Math.max(0, Math.min(100, s))), ratio, extra, long};
}

/* ---------- microfone: aberto uma vez e mantido enquanto estiver em Diálogos ---------- */
async function ensureMic(){
  const ctx = audioCtx(); if (!ctx || !navigator.mediaDevices) throw new Error("no-audio");
  if (DLG.stream && DLG.stream.getAudioTracks().some(t => t.readyState === "live")) return;
  DLG.stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:false, autoGainControl:false}});
  DLG.src = ctx.createMediaStreamSource(DLG.stream);
}
function releaseMic(){
  stopCapture();
  if (DLG.stream){ DLG.stream.getTracks().forEach(t => t.stop()); }
  DLG.stream = null; DLG.src = null;
}
document.addEventListener("visibilitychange", () => { if (document.hidden) releaseMic(); });
async function startCapture(onLevel){
  await ensureMic();
  const ctx = audioCtx();
  const proc = ctx.createScriptProcessor(4096, 1, 1), chunks = [];
  proc.onaudioprocess = e => {
    const d = new Float32Array(e.inputBuffer.getChannelData(0)); chunks.push(d);
    let s = 0; for (let i=0;i<d.length;i++) s += d[i]*d[i];
    if (onLevel) onLevel(Math.sqrt(s/d.length));
  };
  DLG.src.connect(proc); proc.connect(ctx.destination);
  DLG.cap = {proc, chunks, sr: ctx.sampleRate};
}
function stopCapture(){
  const c = DLG.cap; if (!c) return null; DLG.cap = null;
  try{ DLG.src && DLG.src.disconnect(c.proc); c.proc.disconnect(); }catch(e){}
  const n = c.chunks.reduce((s,a)=>s+a.length,0), out = new Float32Array(n);
  let o = 0; for (const a of c.chunks){ out.set(a, o); o += a.length; }
  return {samples: out, sr: c.sr};
}

/* ---------- reconhecimento da resposta inteira (reinicia sozinho nas pausas) ---------- */
function longRecognizer(onText){
  let active = true, finished = false, r = null, err = null, resolve;
  const segs = []; let cur = {joined:"", longest:""};
  const done = new Promise(res => resolve = res);
  const text = () => [...segs.map(s => s.joined), cur.joined].filter(Boolean).join(" ");
  function pushSeg(){ if (cur.joined || cur.longest) segs.push(cur); cur = {joined:"", longest:""}; }
  function finish(){
    if (finished) return; finished = true;
    const a = segs.map(s => s.joined).join(" ").trim(), b = segs.map(s => s.longest).join(" ").trim();
    const alts = [a, b].filter((t,i,arr) => t && arr.indexOf(t) === i).map(t => ({text:t, conf:1}));
    resolve(alts.length ? {alts} : {err: err || "no-speech"});
  }
  function startOne(){
    r = new SR();
    r.lang = DLG_LANG; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = e => {
      const parts = [];
      for (let i=0;i<e.results.length;i++){ const t = e.results[i][0].transcript.trim(); parts.push(t);
        if (t.length > cur.longest.length) cur.longest = t; }
      cur.joined = parts.join(" ");
      onText(text());
    };
    r.onerror = e => { if (e.error !== "no-speech" && e.error !== "aborted") err = e.error; };
    r.onend = () => {
      pushSeg();
      if (active && !err){ try { startOne(); return; } catch(e){} }
      finish();
    };
    r.start();
  }
  if (!SR) resolve({err:"unsupported"});
  else try { startOne(); } catch(e){ resolve({err:"start-failed"}); finished = true; }
  return {
    done, text,
    stop(){ active = false; try{ r && r.stop(); }catch(e){} setTimeout(() => { pushSeg(); finish(); }, 2500); },
    abort(){ active = false; if (r){ r.onend = null; r.onresult = null; try{ r.abort(); }catch(e){} } finished = true; resolve({err:"aborted"}); }
  };
}

/* ---------- divide a gravação inteira em frases, usando as pausas ---------- */
function splitBySentences(raw, sr, refDurs){
  const x = resample(raw, sr);
  const nF = Math.max(0, Math.floor((x.length - AN_WIN) / AN_HOP));
  const n = refDurs.length;
  if (nF < 10) return refDurs.map(() => null);
  const rms = new Float32Array(nF);
  for (let f=0; f<nF; f++){ let s = 0, o = f*AN_HOP; for (let i=0;i<AN_WIN;i++){ const v = x[o+i]; s += v*v; } rms[f] = Math.sqrt(s/AN_WIN); }
  const thr = Math.max(pct(rms,0.15)*2.5, pct(rms,0.95)*0.12, 0.004);
  const sp = Array.from(rms, v => v > thr);
  const start = sp.indexOf(true), end = sp.lastIndexOf(true);
  if (start < 0) return refDurs.map(() => null);
  const gaps = [];
  for (let f=start; f<=end; f++) if (!sp[f]){ let j = f; while (j<=end && !sp[j]) j++;
    if (j - f >= 10) gaps.push({mid: (f+j)/2, len: j-f}); f = j; }
  const total = refDurs.reduce((a,b)=>a+b,0) || 1;
  const cuts = []; let cum = 0, minF = start;
  for (let k=0; k<n-1; k++){
    cum += refDurs[k];
    const exp = start + (end-start)*cum/total;
    let best = null, bestCost = Infinity;
    for (const g of gaps){ if (g.used || g.mid <= minF) continue;
      const cost = Math.abs(g.mid - exp) - g.len*1.5;
      if (Math.abs(g.mid - exp) < (end-start)*0.35 && cost < bestCost){ best = g; bestCost = cost; } }
    let cut = exp;
    if (best){ best.used = true; cut = best.mid; }
    cut = Math.max(cut, minF + 1); cuts.push(cut); minF = cut;
  }
  const bounds = [start, ...cuts, end + 1];
  const segs = [];
  for (let k=0; k<n; k++){
    const a = Math.floor(bounds[k]) * AN_HOP, b = Math.min(x.length, Math.ceil(bounds[k+1]) * AN_HOP + AN_WIN);
    const piece = x.slice(a, b);
    segs.push(piece.length > AN_WIN*6 ? {samples: piece, an: analyzeSpeech(piece, AN_SR)} : null);
  }
  return segs;
}

/* ---------- pronúncia: compara o texto inteiro e divide a nota por frase ---------- */
function evaluateAnswer(sentences, alts){
  const tw = []; sentences.forEach((s, i) => norm(s.t, DLG_LANG).forEach(w => tw.push({w, i})));
  let best = null;
  for (const a of alts){
    const heard = norm(a.text, DLG_LANG);
    const ops = align(tw.map(x => x.w), heard);
    const per = sentences.map(() => ({ops: [], credit: 0, words: 0, extra: 0, heard: []}));
    let ti = 0, lastS = 0;
    for (const o of ops){
      if (o.t != null){
        const si = tw[ti++].i; lastS = si;
        const c = o.sim >= 0.999 ? 1 : o.sim >= 0.9 ? 0.9 : o.sim >= 0.6 ? o.sim*0.6 : 0;
        per[si].ops.push(o); per[si].credit += c; per[si].words++;
        if (o.h) per[si].heard.push(o.h);
      } else { per[lastS].extra++; per[lastS].heard.push(o.h); }
    }
    per.forEach(p => { p.score = p.words ? Math.max(0, Math.round(p.credit/p.words*100 - Math.min(15, p.extra*5))) : 0; });
    const total = per.reduce((s,p) => s + p.score*p.words, 0) / Math.max(1, tw.length);
    if (!best || total > best.total) best = {total, per, heard: a.text};
  }
  return best;
}

/* ---------- telas ---------- */
VIEWS.dialogos = function(){
  $title.textContent = "💬 Diálogos";
  const st = dlgStats();
  let h = "";
  for (const s of DIALOG_SETS){
    h += `<h3 style="margin:6px 4px 10px">${esc(s.name)}</h3><div class="box" style="padding:6px 14px">`;
    s.dialogs.forEach((d, i) => {
      const b = st[d.id];
      h += `<div class="cardline" data-dlg="${d.id}" style="cursor:pointer">
        <div class="dnum">${i+1}</div>
        <div class="t"><div>${esc(d.q)}</div><div class="muted">${d.a.length} frase${d.a.length>1?"s":""}</div></div>
        ${b ? `<span class="pill ${b.best>=80?"due":"new"}">${b.best}%</span>` : `<span class="muted">›</span>`}</div>`;
    });
    h += `</div>`;
  }
  h += `<div class="box">
    <label style="display:flex;gap:10px;align-items:center;color:var(--text);margin:0"><input type="checkbox" id="dau" style="width:auto" ${dlgAudioOn()?"checked":""}>
      Avaliar fluência e entonação (analisa o áudio do microfone)</label>
    <p class="muted" style="margin-bottom:0">Se o microfone der erro no seu iPhone, desligue esta opção. A nota de pronúncia continua funcionando.</p></div>`;
  $app.innerHTML = h;
  $app.querySelectorAll("[data-dlg]").forEach(el => el.onclick = () => go("dialogo", el.dataset.dlg));
  document.getElementById("dau").onchange = e => { DB.settings.dlgAudio = e.target.checked; save(); };
  onLeave = next => { if (next !== "dialogo") releaseMic(); };
};

VIEWS.dialogo = function(id){
  const all = allDialogs(), pos = all.findIndex(d => d.id === id), d = all[pos];
  if (!d) return back();
  const view = ++babyRun; // reaproveita o contador global para cancelar tarefas de telas antigas
  const alive = () => view === babyRun && stack[stack.length-1][0] === "dialogo";
  const inSet = d.set.dialogs.findIndex(x => x.id === id);
  $title.textContent = `Exercício ${inSet+1} de ${d.set.dialogs.length}`;
  let mode = "idle", recog = null, autoStop = null;
  const cum = []; d.a.reduce((s, x, i) => (cum[i] = s + norm(x.t, DLG_LANG).length), 0);
  onLeave = next => { stopRec(true); stopPlayer(); if (next !== "dialogo" && next !== "dialogos") releaseMic(); };

  $app.innerHTML = `
    <div class="bubble q"><div class="who">👩 Entrevistadora <button class="ghost small" id="pq">🔊</button></div>
      <div class="qt">${esc(d.q)}</div></div>
    <div class="bubble a"><div class="who">👨 Você</div>
      <div id="sents">${d.a.map((s,i) => `<div class="sent" data-i="${i}"><div class="st">${esc(s.t)}</div><div class="sr" id="sr${i}"></div></div>`).join("")}</div></div>
    ${d.note ? `<div class="tip">💡 <b>Dica:</b> ${esc(d.note)}</div>` : ""}
    <div class="dctl">
      <button id="ex">▶ Ouvir exemplo</button>
      <button class="primary" id="pr">🎤 Praticar</button>
    </div>
    <button class="mic hidden" id="dmic" aria-label="Terminei">⏹</button>
    <p class="muted" id="dhint" style="text-align:center;margin:4px 0 0">Ouça o exemplo. Depois toque em Praticar: a pergunta toca e você lê a resposta inteira.</p>
    <div id="sum"></div>
    <div class="row" style="margin-top:14px">
      <button id="prev" ${pos===0?"disabled":""}>‹ Anterior</button>
      <button id="next" ${pos===all.length-1?"disabled":""}>Próximo ›</button></div>`;
  const $ = x => document.getElementById(x);
  const sentEl = i => $app.querySelector(`.sent[data-i="${i}"]`);
  const hint = t => { $("dhint").textContent = t; };
  const qBubble = () => $("pq").closest(".bubble");
  function mark(i, cls){ $app.querySelectorAll(".sent").forEach(e => e.classList.remove(cls)); if (i != null && i >= 0) sentEl(i).classList.add(cls); }

  if (dlgAudioOn()) d.a.forEach(s => refAnalysis(s.audio).catch(()=>{}));

  $("pq").onclick = () => playFile(d.qAudio);
  $("prev").onclick = () => go("dialogo", all[pos-1].id, true);
  $("next").onclick = () => go("dialogo", all[pos+1].id, true);
  $app.querySelectorAll(".sent .st").forEach(el => el.onclick = () => {
    const i = +el.parentElement.dataset.i; if (mode === "rec") return;
    mark(i, "playing"); playFile(d.a[i].audio).then(() => alive() && mark(null, "playing"));
  });

  $("ex").onclick = async () => {
    if (mode === "example"){ stopPlayer(); mode = "idle"; $("ex").textContent = "▶ Ouvir exemplo"; mark(null,"playing"); return; }
    if (mode === "rec") return;
    mode = "example"; $("ex").textContent = "⏹ Parar"; audioCtx();
    qBubble().classList.add("talking"); await playFile(d.qAudio); qBubble().classList.remove("talking");
    for (let i=0; i<d.a.length; i++){
      if (!alive() || mode !== "example") return;
      mark(i, "playing"); await playFile(d.a[i].audio); await wait(150);
    }
    if (!alive()) return;
    mark(null, "playing"); mode = "idle"; $("ex").textContent = "▶ Ouvir exemplo";
    hint("Agora é sua vez: toque em Praticar.");
  };

  $("pr").onclick = async () => {
    if (mode === "rec" || mode === "eval") return;
    stopPlayer(); audioCtx(); mode = "q";
    d.a.forEach((_, i) => { $("sr"+i).innerHTML = ""; sentEl(i).classList.remove("done"); });
    $("sum").innerHTML = ""; mark(null, "playing");
    // abre o microfone agora (dentro do toque), uma vez só para toda a seção
    if (dlgAudioOn()) await ensureMic().catch(() => {});
    hint("Ouça a pergunta…");
    qBubble().classList.add("talking"); await playFile(d.qAudio);
    if (!alive()) return;
    qBubble().classList.remove("talking");
    startRec();
  };
  $("dmic").onclick = () => {
    if (mode === "rec") return stopRec(false);
    if (mode === "tap") startRec();
  };

  function startRec(){
    stopPlayer();
    const t0 = Date.now();
    let heardAny = false, lastLoud = 0, lastText = 0, capOk = false;
    recog = longRecognizer(txt => {
      heardAny = true; lastText = Date.now();
      // destaca a frase em que você provavelmente está
      const nw = norm(txt, DLG_LANG).length;
      let i = cum.findIndex(c => c > nw); if (i < 0) i = d.a.length - 1;
      mark(i, "current");
    });
    recog.done.then(res => finish(res));
    mode = "rec"; mark(0, "current");
    $("dmic").classList.remove("hidden"); $("dmic").classList.add("on"); $("dmic").textContent = "⏹";
    hint("Ouvindo… leia a resposta inteira. Toque no ⏹ quando terminar.");
    if (dlgAudioOn()){
      startCapture(level => { if (level > 0.02){ lastLoud = Date.now(); heardAny = true; } })
        .then(() => { capOk = true; }).catch(() => { capOk = false; });
    }
    // encerra sozinho depois de ~3,5 s de silêncio, ou aos 3 minutos
    autoStop = setInterval(() => {
      const now = Date.now();
      if (now - t0 > 180000) return stopRec(false);
      if (!heardAny){ if (now - t0 > 10000) stopRec(false); return; }
      const quietAudio = capOk ? (now - lastLoud > 3500) : true;
      const quietText = now - (lastText || t0) > 4000;
      if (quietAudio && quietText) stopRec(false);
    }, 300);
  }
  function stopRec(cancel){
    if (autoStop){ clearInterval(autoStop); autoStop = null; }
    if (cancel){ if (recog) recog.abort(); recog = null; stopCapture(); if (mode === "rec") mode = "idle"; return; }
    if (mode !== "rec") return;
    mode = "eval";
    if (recog) recog.stop();
    $("dmic").classList.remove("on"); $("dmic").textContent = "⏳";
    hint("Avaliando a resposta inteira…");
  }

  async function finish(res){
    if (autoStop){ clearInterval(autoStop); autoStop = null; }
    recog = null;
    const cap = stopCapture();
    if (!alive() || res.err === "aborted") return;
    mark(null, "current");
    if (res.err){
      const msg = {
        "not-allowed":"Permissão negada. Ative o microfone para o Safari e o Ditado em Ajustes › Geral › Teclado.",
        "service-not-allowed":"O iPhone bloqueou o reconhecimento. Ative o Ditado em Ajustes › Geral › Teclado.",
        "start-failed":"O iPhone não deixou começar sozinho. Toque no 🎤 para ler a resposta.",
        "no-speech":"Não ouvi nada. Toque no 🎤 e leia a resposta.",
        "audio-capture":"O microfone ficou ocupado. Desliguei a análise de fluência e entonação; tente de novo.",
        "network":"O reconhecimento de voz precisa de internet.",
        "unsupported":"Este navegador não reconhece voz. Use o Safari do iPhone."
      }[res.err] || ("Erro no reconhecimento: " + res.err);
      if (res.err === "audio-capture"){ DB.settings.dlgAudio = false; save(); }
      toast(msg, 4500);
      mode = "tap"; $("dmic").classList.remove("hidden", "on"); $("dmic").textContent = "🎤";
      hint("Toque no 🎤 e leia a resposta inteira.");
      return;
    }
    $("dmic").classList.add("hidden");
    const pron = evaluateAnswer(d.a, res.alts);
    let segs = d.a.map(() => null), refs = d.a.map(() => null);
    if (cap && cap.samples.length > cap.sr*0.5){
      try {
        refs = await Promise.all(d.a.map(s => refAnalysis(s.audio)));
        segs = splitBySentences(cap.samples, cap.sr, refs.map(r => r ? r.dur : 1));
      } catch(e){}
    }
    if (!alive()) return;
    const results = d.a.map((s, i) => {
      const p = pron.per[i], seg = segs[i];
      const flu = seg && refs[i] ? fluencyScore(refs[i], seg.an) : null;
      const into = seg && refs[i] ? intonationScore(refs[i], seg.an) : null;
      const parts = [p.score, flu && flu.score, into && into.score], w = [0.5, 0.25, 0.25];
      let tot = 0, ws = 0; parts.forEach((v,k) => { if (v != null){ tot += v*w[k]; ws += w[k]; } });
      return {pron: p.score, flu: flu && flu.score, int: into && into.score, total: Math.round(tot/ws),
              words: p.words, p, fluD: flu, intoD: into, seg};
    });
    results.forEach((r, i) => { renderResult(i, r); sentEl(i).classList.add("done"); });
    mode = "idle";
    summary(results, pron.heard);
  }

  function chip(label, v){
    if (v == null) return `<span class="chip">${label} –</span>`;
    const c = v >= 80 ? "ok" : v >= 60 ? "mid" : "bad";
    return `<span class="chip ${c}">${label} ${v}</span>`;
  }
  function renderResult(i, r){
    const words = r.p.ops.map(o => {
      const cls = o.sim >= 0.999 ? "w-ok" : o.sim >= 0.6 ? "w-near" : o.h ? "w-bad" : "w-miss";
      return `<span class="${cls}" data-w="${esc(o.t)}">${esc(o.t)}</span>`; }).join(" ");
    const tips = [];
    const flu = r.fluD, into = r.intoD;
    if (flu){ if (flu.ratio > 1.5) tips.push("fale um pouco mais rápido e emende as palavras");
      if (flu.extra > 0) tips.push(`${flu.extra} pausa${flu.extra>1?"s":""} a mais que o modelo`); }
    if (into){ if (into.flat) tips.push("voz muito reta: varie mais a melodia");
      else if (into.endWrong) tips.push(into.refUp ? "o final deve subir" : "o final deve descer"); }
    $("sr"+i).innerHTML = `
      <div class="chips"><b class="tot">${r.total}%</b>${chip("Pronúncia", r.pron)}${chip("Fluência", r.flu)}${chip("Entonação", r.int)}</div>
      <div class="wres small">${words}</div>
      ${r.p.heard.length ? `<div class="heard">Entendi: “${esc(r.p.heard.join(" "))}”</div>` : `<div class="heard">Não ouvi esta frase.</div>`}
      ${tips.length ? `<div class="heard">💡 ${tips.join(" · ")}</div>` : ""}
      <div class="sbtn"><button class="small" data-act="model">🔊 Modelo</button>
        ${r.seg ? `<button class="small" data-act="mine">▶ Minha voz</button>` : ""}</div>`;
    $("sr"+i).querySelectorAll("[data-w]").forEach(el => el.onclick = () => speak(el.dataset.w, DLG_LANG, 0.8));
    $("sr"+i).querySelectorAll("[data-act]").forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      if (b.dataset.act === "model") playFile(d.a[i].audio);
      if (b.dataset.act === "mine") playSamples(r.seg.samples, AN_SR);
    });
  }

  function summary(res){
    const avg = k => { let s = 0, w = 0; res.forEach(r => { if (r[k] != null){ s += r[k]*r.words; w += r.words; } }); return w ? Math.round(s/w) : null; };
    const P = avg("pron"), F = avg("flu"), I = avg("int"), T = avg("total");
    const st = dlgStats(), old = st[d.id];
    st[d.id] = {best: Math.max(T, old ? old.best : 0), last: T, pron: P, flu: F, int: I, at: Date.now()}; save();
    const bar = (l, v) => `<div class="sbar"><span>${l}</span><div><i style="width:${v||0}%;background:${v>=80?"var(--ok)":v>=60?"var(--warn)":"var(--bad)"}"></i></div><b>${v==null?"–":v}</b></div>`;
    $("sum").innerHTML = `<div class="box" style="margin-top:14px">
      <div style="text-align:center"><div class="score" style="color:${T>=80?"var(--ok)":T>=60?"var(--warn)":"var(--bad)"}">${T}%</div>
      <div class="muted">${T>=85?"Excelente! 🎉":T>=70?"Muito bom, mais uma rodada e fica natural.":"Ouça o modelo das frases com nota baixa e leia de novo."}${old?` · melhor: ${st[d.id].best}%`:""}</div></div>
      ${bar("Pronúncia", P)}${bar("Fluência", F)}${bar("Entonação", I)}
      <div class="row" style="margin-top:12px"><button id="again">↻ Ler de novo</button>
        ${pos < all.length-1 ? `<button class="primary" id="go2">Próximo ›</button>` : ""}</div></div>`;
    hint("Exercício concluído. As notas de cada frase estão acima.");
    $("again").onclick = () => $("pr").click();
    if ($("go2")) $("go2").onclick = () => go("dialogo", all[pos+1].id, true);
    $("sum").scrollIntoView({behavior:"smooth"});
  }
};
