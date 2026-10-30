"use strict";
/* ============ Estudo com cartas (arrastar estilo Tinder, visual da Paciência) ============
   Toque vira a carta. Arrastar para a direita = já sei (volta amanhã).
   Arrastar para a esquerda = de novo (vai para o fim da fila). */

const SUITS = ["♠","♥","♦","♣"], RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
function cardLook(id){
  let h = 0; for (const ch of id) h = (h*31 + ch.charCodeAt(0)) >>> 0;
  const suit = SUITS[h % 4];
  return {suit, rank: RANKS[(h >> 3) % 13], red: suit === "♥" || suit === "♦"};
}
function tomorrowAt4(){ const d = new Date(); d.setHours(4,0,0,0); return d.getTime() + DAY; }
function buildQueue(deckId){
  const cs = DB.cards.filter(c => c.deckId === deckId);
  const due = cs.filter(c => !c.isNew && c.due <= endOfToday()).sort((a,b) => a.due - b.due);
  const newLeft = Math.max(0, DB.settings.newPerDay - (dayLog().newDone || 0));
  const nu = cs.filter(c => c.isNew).sort((a,b) => a.created - b.created).slice(0, newLeft);
  return [...due, ...nu].map(c => c.id);
}
function knowCard(card){
  const log = dayLog();
  if (card.isNew) log.newDone++; else log.reviews++;
  card.isNew = false; card.reps++; card.interval = 1; card.due = tomorrowAt4();
  save();
}

VIEWS.study = function(deckId){
  const d = deckById(deckId); if (!d) return back();
  $title.textContent = d.name;
  const queue = buildQueue(deckId);
  let known = 0, busy = false;

  $app.innerHTML = `<div class="felt">
    <div class="ftop"><span id="fleft"></span><span id="fdone"></span></div>
    <div class="pile" id="pile">
      <div class="stamp yes" id="sy">SEI ✓</div><div class="stamp no" id="sn">↺ DE NOVO</div>
    </div>
    <div class="fbtns">
      <button class="fb no" id="bno" aria-label="De novo">↺</button>
      <button class="fb say" id="bsay" aria-label="Ouvir">🔊</button>
      <button class="fb yes" id="byes" aria-label="Já sei">✓</button>
    </div>
    <p class="fhint">Toque para virar · arraste → já sei · ← de novo</p></div>`;
  const $ = id => document.getElementById(id);
  const card = id => DB.cards.find(c => c.id === id);

  function faceHtml(c){
    const lk = cardLook(c.id), col = lk.red ? "red" : "blk";
    const [def, ...ex] = (c.back || "").split("\n");
    const idx = `<div class="pc tl ${col}">${lk.rank}<br>${lk.suit}</div><div class="pc br ${col}">${lk.rank}<br>${lk.suit}</div>`;
    return `<div class="pinner">
      <div class="pface pfront">${idx}<div class="psuit ${col}">${lk.suit}</div><div class="pword">${esc(c.front)}</div></div>
      <div class="pface pback">${idx}<div class="pmini">${esc(c.front)}</div>
        <div class="pdef">${esc(def || "—")}</div>${ex.length ? `<div class="pex">${esc(ex.join(" "))}</div>` : ""}</div></div>`;
  }

  function renderPile(deal){
    $app.querySelectorAll(".pcard").forEach(e => e.remove());
    $("fleft").textContent = queue.length ? `${queue.length} na fila` : "";
    $("fdone").textContent = `✓ ${known}`;
    if (!queue.length) return victory();
    const pile = $("pile");
    // cartas de baixo, viradas para baixo (no máximo 3)
    for (let i = Math.min(queue.length-1, 3); i >= 1; i--){
      const el = document.createElement("div");
      el.className = "pcard down";
      el.style.transform = `translate(${i*3}px, ${i*5}px) rotate(${(i%2?1:-1)*i*1.2}deg)`;
      pile.appendChild(el);
    }
    const top = document.createElement("div");
    top.className = "pcard top" + (deal ? " deal" : "");
    top.innerHTML = faceHtml(card(queue[0]));
    pile.appendChild(top);
    attachDrag(top);
  }

  function attachDrag(el){
    let sx = 0, sy = 0, dx = 0, dy = 0, t0 = 0, down = false;
    el.addEventListener("pointerdown", e => {
      if (busy) return;
      down = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; t0 = Date.now();
      el.setPointerCapture(e.pointerId); el.style.transition = "none"; el.classList.remove("deal");
    });
    el.addEventListener("pointermove", e => {
      if (!down) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx/14}deg)`;
      $("sy").style.opacity = Math.max(0, Math.min(1, dx/90));
      $("sn").style.opacity = Math.max(0, Math.min(1, -dx/90));
    });
    const up = () => {
      if (!down) return; down = false;
      const v = Math.abs(dx) / Math.max(1, Date.now() - t0);
      if (Math.abs(dx) > 95 || (Math.abs(dx) > 40 && v > 0.6)) return fly(el, dx > 0 ? 1 : -1, dy);
      $("sy").style.opacity = 0; $("sn").style.opacity = 0;
      el.style.transition = "transform .35s cubic-bezier(.2,1.4,.4,1)";
      el.style.transform = "";
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) el.classList.toggle("flipped");
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  function fly(el, dir, dy){
    if (busy) return; busy = true;
    $(dir > 0 ? "sy" : "sn").style.opacity = 1;
    el.style.transition = "transform .38s ease-in, opacity .38s ease-in";
    el.style.transform = `translate(${dir*window.innerWidth*1.1}px, ${(dy||0)+60}px) rotate(${dir*32}deg)`;
    el.style.opacity = "0.2";
    if (navigator.vibrate) navigator.vibrate(dir > 0 ? 15 : [10, 40, 10]);
    setTimeout(() => {
      const id = queue.shift();
      if (dir > 0){ knowCard(card(id)); known++; } else queue.push(id);
      $("sy").style.opacity = 0; $("sn").style.opacity = 0;
      busy = false; renderPile(true);
    }, 380);
  }

  $("byes").onclick = () => { const t = $app.querySelector(".pcard.top"); if (t) fly(t, 1, 0); };
  $("bno").onclick = () => { const t = $app.querySelector(".pcard.top"); if (t) fly(t, -1, 0); };
  $("bsay").onclick = () => { if (queue.length) speak(card(queue[0]).front, d.lang); };

  let anim = null;
  onLeave = () => { if (anim) anim.stop(); };
  renderPile(true);

  function victory(){
    $("pile").innerHTML = `<div class="fdone">
      <div style="font-size:52px">🏆</div><h2>Baralho concluído!</h2>
      <p>${known ? `${known} carta${known>1?"s":""} para amanhã.` : "Nada para revisar agora."}</p>
      <button class="primary" id="vh">Voltar ao início</button></div>`;
    $("vh").onclick = () => { stack = [["home"]]; render(); };
    $app.querySelector(".fbtns").classList.add("hidden");
    $app.querySelector(".fhint").classList.add("hidden");
    if (known) anim = bouncingCards();
  }
};

/* a famosa animação de vitória da Paciência: cartas quicando e deixando rastro */
function bouncingCards(){
  const cv = document.createElement("canvas");
  cv.className = "vcanvas";
  const dpr = window.devicePixelRatio || 1, W = window.innerWidth, H = window.innerHeight;
  cv.width = W*dpr; cv.height = H*dpr; cv.style.width = W+"px"; cv.style.height = H+"px";
  document.body.appendChild(cv);
  const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const CW = 52, CH = 72, cards = [];
  let spawned = 0, raf = 0, stopped = false, t = 0;
  function drawCard(c){
    g.fillStyle = "#fff"; g.strokeStyle = "#333"; g.lineWidth = 1;
    g.beginPath(); g.roundRect ? g.roundRect(c.x, c.y, CW, CH, 5) : g.rect(c.x, c.y, CW, CH); g.fill(); g.stroke();
    g.fillStyle = c.red ? "#c62828" : "#111";
    g.font = "bold 13px -apple-system, sans-serif"; g.fillText(c.rank, c.x+4, c.y+15);
    g.font = "24px -apple-system, sans-serif"; g.fillText(c.suit, c.x+CW/2-9, c.y+CH/2+9);
  }
  function step(){
    if (stopped) return;
    t++;
    if (spawned < 26 && t % 14 === 1){
      const suit = SUITS[spawned % 4];
      cards.push({x: W - 70 - (spawned % 4)*58, y: 10, vx: -(2 + Math.random()*4) * (Math.random() < 0.25 ? -1 : 1),
        vy: -Math.random()*3, suit, rank: RANKS[12 - Math.floor(spawned/4) % 13], red: suit === "♥" || suit === "♦"});
      spawned++;
    }
    for (const c of cards){
      if (c.out) continue;
      c.vy += 0.45; c.x += c.vx; c.y += c.vy;
      if (c.y + CH > H){ c.y = H - CH; c.vy = -c.vy * 0.78; }
      if (c.x < -CW || c.x > W) c.out = true;
      drawCard(c);
    }
    if (spawned >= 26 && cards.every(c => c.out)) return stop();
    raf = requestAnimationFrame(step);
  }
  function stop(){ if (stopped) return; stopped = true; cancelAnimationFrame(raf);
    cv.style.transition = "opacity .5s"; cv.style.opacity = 0; setTimeout(() => cv.remove(), 500); }
  cv.onclick = stop;
  raf = requestAnimationFrame(step);
  return {stop};
}
