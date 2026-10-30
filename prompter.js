"use strict";
/* ============ Teleprompter: cadência e entonação ============
   Tela cheia, fundo azul-marinho, texto branco em maiúsculas rolando como karaokê.
   Semáforo nas sílabas: vermelho = foco do trecho, amarelo = tônica, verde = tônica secundária.
   A palavra atual fica em negrito: segue o áudio do modelo (▶) ou a sua voz (🎤). */

VIEWS.prompter = function(){
  $title.textContent = "📺 Teleprompter";
  const sets = [];
  PROMPTER.forEach(p => { let s = sets.find(x => x.name === p.set); if (!s) sets.push(s = {name: p.set, items: []}); s.items.push(p); });
  let h = `<div class="box tp-legend-box">
    <b>Como ler o semáforo</b>
    <div class="tp-leg"><span class="lg s3">■</span> Vermelho: a sílaba mais forte do trecho (foco)</div>
    <div class="tp-leg"><span class="lg s2">■</span> Amarelo: sílaba tônica da palavra</div>
    <div class="tp-leg"><span class="lg s1">■</span> Verde: tônica secundária, ênfase leve</div>
    <div class="tp-leg"><span class="lg pz">‖</span> Pausa curta: respire e mude a melodia</div>
    <p class="muted" style="margin:8px 0 0">Palavras brancas são ditas de leve, emendadas nas vizinhas.</p></div>`;
  for (const s of sets){
    h += `<h3 style="margin:6px 4px 10px">${esc(s.name)}</h3><div class="box" style="padding:6px 14px">`;
    s.items.forEach((p, i) => {
      h += `<div class="cardline" data-tp="${p.id}" style="cursor:pointer"><div class="dnum">${i+1}</div>
        <div class="t"><div>${esc(p.q)}</div><div class="muted">${p.w.length} palavras</div></div><span class="muted">›</span></div>`;
    });
    h += `</div>`;
  }
  $app.innerHTML = h;
  $app.querySelectorAll("[data-tp]").forEach(el => el.onclick = () => go("prompterPlay", el.dataset.tp));
};

VIEWS.prompterPlay = function(id){
  const p = PROMPTER.find(x => x.id === id); if (!p) return back();
  const view = ++babyRun;
  const alive = () => view === babyRun && stack[stack.length-1][0] === "prompterPlay";
  let size = +(DB.settings.tpSize || 34), cur = -1, mode = "idle", audio = null, raf = 0, recog = null, wake = null;

  document.body.classList.add("fs");
  const words = p.w.map(([syl, pause], i) => {
    const inner = syl.map(([t, lv]) => lv ? `<span class="s${lv}">${esc(t)}</span>` : esc(t)).join("");
    return `<span class="tw" data-i="${i}">${inner}</span>${pause ? `<span class="pz"> ‖</span>` : ""}`;
  }).join(" ");
  $app.innerHTML = `<div class="tp" id="tp">
    <div class="tp-scroll" id="tps" style="font-size:${size}px">
      <div class="tp-q">${esc(p.q)}</div>
      <div class="tp-text">${words}</div>
      <div class="tp-end" id="tpend"></div>
    </div>
    <div class="tp-guide"></div>
    <div class="tp-bar">
      <button id="tx" aria-label="Fechar">✕</button>
      <button id="tm" aria-label="Diminuir">A−</button>
      <button id="tpl" aria-label="Aumentar">A+</button>
      <button id="tmodel" class="wide">▶ Modelo</button>
      <button id="tmic" class="wide">🎤 Eu leio</button>
    </div></div>`;
  const $ = x => document.getElementById(x);
  const wEls = [...$app.querySelectorAll(".tw")];

  function setCur(i, smooth = true){
    i = Math.max(-1, Math.min(wEls.length - 1, i));
    if (i === cur) return;
    if (cur >= 0) wEls[cur].classList.remove("cur");
    for (let k = Math.max(0, Math.min(cur, i)); k < wEls.length; k++) wEls[k].classList.toggle("past", k < i);
    cur = i;
    if (i >= 0){ wEls[i].classList.add("cur"); scrollTo(wEls[i], smooth); }
  }
  function scrollTo(el, smooth){
    const y = el.offsetTop - window.innerHeight * 0.34;
    $("tps").style.transition = smooth ? "transform .55s ease" : "none";
    $("tps").style.transform = `translateY(${-Math.max(0, y)}px)`;
  }
  function reset(){ wEls.forEach(e => e.classList.remove("past", "cur")); cur = -1; $("tps").style.transform = ""; $("tpend").textContent = ""; }
  function stopAll(){
    if (audio){ audio.onended = null; audio.pause(); audio = null; }
    cancelAnimationFrame(raf);
    if (recog){ recog.abort(); recog = null; }
    mode = "idle"; $("tmodel").textContent = "▶ Modelo"; $("tmic").textContent = "🎤 Eu leio";
    $("tmic").classList.remove("on");
  }
  async function keepAwake(){ try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch(e){} }
  onLeave = () => { stopAll(); document.body.classList.remove("fs"); try { wake && wake.release(); } catch(e){} };
  keepAwake();

  /* ---- modo modelo: o negrito acompanha a voz do Andrew ---- */
  $("tmodel").onclick = async () => {
    if (mode === "model"){ stopAll(); return; }
    stopAll(); reset(); mode = "model"; $("tmodel").textContent = "⏸ Parar";
    for (const s of p.s){
      if (!alive() || mode !== "model") return;
      audio = new Audio(s.audio);
      const a = audio;
      const tick = () => {
        if (a !== audio) return;
        const ms = a.currentTime * 1000;
        let k = 0; while (k + 1 < s.t.length && s.t[k+1] <= ms) k++;
        setCur(s.from + k);
        raf = requestAnimationFrame(tick);
      };
      await new Promise(res => { a.onended = res; a.onerror = res; a.play().then(() => { raf = requestAnimationFrame(tick); }).catch(res); });
      cancelAnimationFrame(raf);
      await wait(120);
    }
    if (!alive() || mode !== "model") return;
    setCur(wEls.length - 1); stopAll();
    $("tpend").textContent = "Agora é a sua vez: toque em 🎤 Eu leio.";
  };

  /* ---- modo eu leio: o negrito segue a sua voz ---- */
  const flat = [];  // palavras normalizadas → índice da palavra exibida
  p.w.forEach(([syl], i) => norm(syl.map(s => s[0]).join(""), "en-US").forEach(t => flat.push({t, i})));
  function follow(text){
    const heard = norm(text, "en-US");
    let ptr = 0;
    for (const h of heard){
      for (let t = ptr; t < Math.min(flat.length, ptr + 6); t++){
        if (charSim(flat[t].t, h) >= 0.7){ ptr = t + 1; break; }
      }
    }
    if (ptr >= flat.length){ setCur(wEls.length - 1); return true; }
    setCur(flat[ptr].i);
    return false;
  }
  $("tmic").onclick = () => {
    if (mode === "mic"){ stopAll(); return; }
    stopAll(); reset(); mode = "mic";
    $("tmic").textContent = "⏹ Parar"; $("tmic").classList.add("on");
    setCur(0);
    recog = longRecognizer(txt => {
      if (!alive()) return;
      if (follow(txt)){ const r = recog; recog = null; stopAll(); if (r) r.stop(); $("tpend").textContent = "🎉 Muito bem! Leia de novo ou ouça o modelo para comparar a cadência."; }
    });
    recog.done.then(res => {
      if (!alive() || mode !== "mic") return;
      stopAll();
      if (res.err && res.err !== "aborted") toast(res.err === "no-speech" ? "Não ouvi nada. Toque em 🎤 e comece a ler." : "Microfone: " + res.err, 3500);
    });
  };

  $("tx").onclick = () => back();
  const resize = d => { size = Math.max(22, Math.min(64, size + d)); DB.settings.tpSize = size; save();
    $("tps").style.fontSize = size + "px"; if (cur >= 0) scrollTo(wEls[cur], false); };
  $("tm").onclick = () => resize(-4);
  $("tpl").onclick = () => resize(4);
  // toque numa palavra: ouve só ela
  $app.querySelectorAll(".tw").forEach(el => el.onclick = () => { if (mode === "idle") speak(el.textContent, "en-US", 0.8); });
};
