"use strict";
/* ============ Seção Baby: ouvir, repetir e avaliar (para quem ainda não lê) ============ */
const BABY_PASS = 90;          // nota mínima para avançar
const BABY_MAX_SILENCE = 3;    // pausa após N tentativas seguidas sem ouvir ninguém

// [inglês, português, figura, alternativas aceitas em inglês]
const BABY_CATS = [
  {id:"colors", en:"Colors", pt:"Cores", icon:"🎨", kind:"color", items:[
    ["red","vermelho","#e53935",["read"]],["blue","azul","#1e88e5",["blew"]],["yellow","amarelo","#fdd835"],
    ["green","verde","#43a047"],["orange","laranja","#fb8c00"],["purple","roxo","#8e24aa"],["pink","rosa","#f06292"],
    ["brown","marrom","#795548"],["black","preto","#212121"],["white","branco","#ffffff"],["gray","cinza","#9e9e9e",["grey"]]]},
  {id:"shapes", en:"Shapes", pt:"Formas", icon:"🔷", kind:"shape", items:[
    ["circle","círculo","circle"],["square","quadrado","square"],["triangle","triângulo","triangle"],["star","estrela","star"],
    ["heart","coração","heart",["hart"]],["rectangle","retângulo","rectangle"],["oval","oval","oval"],["diamond","losango","diamond"]]},
  {id:"animals", en:"Animals", pt:"Animais", icon:"🐶", kind:"emoji", items:[
    ["dog","cachorro","🐶"],["cat","gato","🐱"],["cow","vaca","🐮"],["pig","porco","🐷"],["horse","cavalo","🐴"],
    ["duck","pato","🦆"],["sheep","ovelha","🐑"],["chicken","galinha","🐔"],["lion","leão","🦁"],["elephant","elefante","🐘"],
    ["monkey","macaco","🐵"],["fish","peixe","🐟"],["bird","pássaro","🐦"],["frog","sapo","🐸"],["rabbit","coelho","🐰",["bunny"]],
    ["bear","urso","🐻",["bare"]],["tiger","tigre","🐯"],["giraffe","girafa","🦒"],["turtle","tartaruga","🐢"],
    ["alligator","jacaré","🐊"],["penguin","pinguim","🐧"],["owl","coruja","🦉"]]},
  {id:"vehicles", en:"Vehicles", pt:"Veículos", icon:"🚗", kind:"emoji", items:[
    ["car","carro","🚗"],["bus","ônibus","🚌"],["truck","caminhão","🚚"],["train","trem","🚂"],
    ["airplane","avião","✈️",["air plane","aeroplane","plane"]],["boat","barco","⛵"],["bike","bicicleta","🚲",["bicycle"]],
    ["motorcycle","moto","🏍️"],["helicopter","helicóptero","🚁"],["rocket","foguete","🚀"],
    ["fire truck","caminhão de bombeiros","🚒",["firetruck"]],["ambulance","ambulância","🚑"],
    ["police car","carro de polícia","🚓"],["tractor","trator","🚜"],["ship","navio","🚢"]]},
  {id:"fruits", en:"Fruits", pt:"Frutas", icon:"🍎", kind:"emoji", items:[
    ["apple","maçã","🍎"],["banana","banana","🍌"],["orange","laranja","🍊"],["grapes","uva","🍇",["grape"]],
    ["strawberry","morango","🍓"],["watermelon","melancia","🍉"],["pineapple","abacaxi","🍍"],["pear","pera","🍐",["pair","pare"]],
    ["cherry","cereja","🍒"],["lemon","limão","🍋"],["peach","pêssego","🍑"],["mango","manga","🥭"],["kiwi","kiwi","🥝"],
    ["coconut","coco","🥥"],["blueberries","mirtilo","🫐",["blueberry"]]]},
  {id:"veggies", en:"Vegetables", pt:"Verduras", icon:"🥕", kind:"emoji", items:[
    ["carrot","cenoura","🥕"],["broccoli","brócolis","🥦"],["corn","milho","🌽"],["potato","batata","🥔"],
    ["tomato","tomate","🍅"],["cucumber","pepino","🥒"],["lettuce","alface","🥬"],["onion","cebola","🧅"],
    ["garlic","alho","🧄"],["pepper","pimentão","🫑"],["eggplant","berinjela","🍆"],["mushroom","cogumelo","🍄"],
    ["peas","ervilha","🫛",["pea"]],["avocado","abacate","🥑"]]},
];
const SHAPE_COLORS = ["#e53935","#1e88e5","#fdd835","#43a047","#fb8c00","#8e24aa","#f06292"];

function babySettings(){
  DB.settings.baby = Object.assign({lang:"en-US", rate:0.8}, DB.settings.baby || {});
  return DB.settings.baby;
}
function babyStats(){ DB.babyStats = DB.babyStats || {}; return DB.babyStats; }

function starPoints(cx, cy, R, r){
  const p = [];
  for (let i=0;i<10;i++){ const a = Math.PI/5*i - Math.PI/2, rad = i%2 ? r : R;
    p.push((cx+rad*Math.cos(a)).toFixed(1)+","+(cy+rad*Math.sin(a)).toFixed(1)); }
  return p.join(" ");
}
function babyPic(cat, item, idx){
  const svg = inner => `<svg viewBox="0 0 100 100" class="bpic-svg" aria-hidden="true">${inner}</svg>`;
  if (cat.kind === "emoji") return `<div class="bpic-emoji">${item[2]}</div>`;
  if (cat.kind === "color") return svg(`<path d="M50 6 C68 4 86 16 90 34 C96 52 92 74 74 86 C58 96 36 96 22 84 C6 70 4 48 12 30 C20 14 34 7 50 6Z"
      fill="${item[2]}" stroke="#9ca3af" stroke-width="${item[2]==="#ffffff"?2:0}"/>`);
  const c = SHAPE_COLORS[idx % SHAPE_COLORS.length];
  const shapes = {
    circle:`<circle cx="50" cy="50" r="42"/>`,
    square:`<rect x="12" y="12" width="76" height="76" rx="3"/>`,
    triangle:`<polygon points="50,8 94,88 6,88" stroke-linejoin="round"/>`,
    star:`<polygon points="${starPoints(50,53,46,19)}"/>`,
    heart:`<path d="M50 90 C20 66 5 50 5 31 C5 16 17 6 30 6 C40 6 47 12 50 19 C53 12 60 6 70 6 C83 6 95 16 95 31 C95 50 80 66 50 90Z"/>`,
    rectangle:`<rect x="4" y="26" width="92" height="48" rx="3"/>`,
    oval:`<ellipse cx="50" cy="50" rx="46" ry="30"/>`,
    diamond:`<polygon points="50,4 90,50 50,96 10,50"/>`,
  };
  return svg(`<g fill="${c}">${shapes[item[2]]}</g>`);
}
function babyWord(item){ return babySettings().lang.startsWith("pt") ? item[1] : item[0]; }

function speakAsync(text, lang, rate){
  return new Promise(res => {
    if (!synth) return res();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = rate;
    const v = pickVoice(lang); if (v) u.voice = v;
    let done = false; const fin = () => { if (!done){ done = true; res(); } };
    u.onend = fin; u.onerror = fin;
    setTimeout(fin, 1500 + text.length * 180); // o iOS às vezes não dispara onend
    synth.speak(u);
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function shuffle(a){ a = a.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function babyScore(item, alts, lang){
  const targets = [babyWord(item)];
  if (!lang.startsWith("pt") && item[3]) targets.push(...item[3]);
  const clean = alts.map(a => ({text: a.text.replace(/\b(a|an|the|um|uma|o)\b/gi, " "), conf:a.conf}));
  let best = null;
  for (const t of targets){
    const r = evaluate(t, clean, lang);
    if (r && (!best || r.score > best.score)) best = r;
  }
  return best;
}

let babyRun = 0; // muda a cada nova sessão; cancela loops antigos

VIEWS.baby = function(){
  babyRun++;
  const s = babySettings(), st = babyStats(), pt = s.lang.startsWith("pt");
  $title.textContent = "👶 Baby";
  const tiles = BABY_CATS.map(c => {
    const done = c.items.filter(i => (st[c.id+":"+babyWordFor(i,s)]||0) >= BABY_PASS).length;
    return `<button class="btile" data-cat="${c.id}"><span class="bt-ic">${c.icon}</span>
      <span class="bt-n">${pt?c.pt:c.en}</span><span class="bt-p">⭐ ${done}/${c.items.length}</span></button>`;
  }).join("");
  $app.innerHTML = `<div class="bgrid">${tiles}
    <button class="btile bt-all" data-cat="all"><span class="bt-ic">🌈</span><span class="bt-n">${pt?"Tudo misturado":"Mix all"}</span></button></div>
    <div class="box" style="margin-top:14px">
      <label style="margin-top:0">Idioma das palavras</label>
      <select id="bl"><option value="en-US" ${!pt?"selected":""}>Inglês</option><option value="pt-BR" ${pt?"selected":""}>Português</option></select>
      <label>Velocidade da voz: <b id="brv">${s.rate.toFixed(2)}</b></label>
      <input type="range" id="brate" min="0.5" max="1.1" step="0.05" value="${s.rate}">
      <p class="muted">Como funciona: o app fala a palavra, abre o microfone sozinho e a criança repete.
      Com nota ${BABY_PASS}% ou mais, comemora e passa para a próxima; abaixo disso, repete a mesma palavra.
      Se ninguém falar ${BABY_MAX_SILENCE} vezes seguidas, ele pausa.</p>
    </div>`;
  $app.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => go("babyPlay", b.dataset.cat));
  document.getElementById("bl").onchange = e => { s.lang = e.target.value; save(); render(); };
  document.getElementById("brate").oninput = e => { s.rate = +e.target.value; document.getElementById("brv").textContent = s.rate.toFixed(2); save(); };
};
function babyWordFor(item, s){ return s.lang.startsWith("pt") ? item[1] : item[0]; }

VIEWS.babyPlay = function(catId){
  const run = ++babyRun;
  const s = babySettings(), lang = s.lang, pt = lang.startsWith("pt");
  let list;
  if (catId === "all") list = shuffle(BABY_CATS.flatMap(c => c.items.map((it,i) => ({cat:c, it, i}))));
  else { const c = BABY_CATS.find(x => x.id === catId); list = shuffle(c.items.map((it,i) => ({cat:c, it, i}))); }
  const catName = catId === "all" ? (pt?"Tudo misturado":"Mix all") : (pt ? list[0].cat.pt : list[0].cat.en);
  $title.textContent = "👶 " + catName;
  let idx = 0, stars = 0, silence = 0, tries = 0, paused = true, turn = 0;

  $app.innerHTML = `
    <div class="bstage">
      <div class="bstars" id="bstars"></div>
      <div class="bpic" id="bpic"></div>
      <div class="bword" id="bword"></div>
      <div class="bstatus" id="bstatus"></div>
      <div class="bface" id="bface"></div>
      <button class="bbig" id="bstart">▶</button>
      <div class="bctrl">
        <button id="bpause" class="hidden">⏸</button>
        <button id="bmic" class="hidden">🎤</button>
        <button id="bskip">⏭</button>
      </div>
      <div class="muted" id="bscore" style="text-align:center;min-height:20px"></div>
    </div>`;
  const $ = id => document.getElementById(id);
  const onScreen = () => run === babyRun && stack[stack.length-1][0] === "babyPlay";
  const alive = t => onScreen() && t === turn;

  function show(){
    const {cat, it, i} = list[idx];
    $("bpic").innerHTML = babyPic(cat, it, i);
    $("bword").textContent = babyWord(it);
    $("bpic").className = "bpic pop";
    $("bstars").textContent = "⭐".repeat(Math.min(stars,10)) + (stars>10 ? " +"+(stars-10) : "");
  }
  function status(icon, cls){ $("bstatus").textContent = icon; $("bstatus").className = "bstatus " + (cls||""); }
  function setPaused(p){
    paused = p;
    $("bstart").classList.toggle("hidden", !p);
    $("bpause").classList.toggle("hidden", p);
    if (p){ turn++; stopListen(); if (synth) synth.cancel(); status(""); }
  }

  async function cycle(){
    const t = ++turn;
    if (!alive(t) || paused) return;
    const item = list[idx].it;
    $("bface").textContent = ""; $("bscore").textContent = "";
    status("🔊", "talk");
    $("bpic").classList.add("bounce");
    await speakAsync(babyWord(item), lang, s.rate);
    if (!alive(t) || paused) return;
    $("bpic").classList.remove("bounce");
    await wait(250);
    if (!alive(t) || paused) return;
    status("👂", "ear");
    listen(lang, (alts, err) => onHeard(t, item, alts, err), on => { if (alive(t) && !on && !paused) status(""); });
  }

  async function onHeard(t, item, alts, err){
    if (!alive(t) || paused) return;
    if (err){
      if (err === "not-allowed" || err === "service-not-allowed" || err === "start-failed"){
        // o iPhone não deixou abrir o microfone sozinho: usa o botão
        status(""); $("bmic").classList.remove("hidden"); $("bmic").classList.add("glow");
        toast(pt?"Toque no 🎤 para falar":"Toque no 🎤 para a criança falar", 3500);
        return;
      }
      if (err === "unsupported"){ setPaused(true); toast("Reconhecimento de voz indisponível. Use o Safari do iPhone.", 4500); return; }
      silence++;
      if (silence >= BABY_MAX_SILENCE){ setPaused(true); silence = 0; $("bface").textContent = "😴"; return; }
      await wait(400); if (!alive(t) || paused) return; return cycle();
    }
    silence = 0; tries++;
    const r = babyScore(item, alts, lang);
    const score = r ? r.score : 0;
    $("bscore").textContent = `${score}% · ouvi “${r ? r.heard : ""}”`;
    const key = list[idx].cat.id + ":" + babyWord(item), st = babyStats();
    st[key] = Math.max(st[key]||0, score); save();
    if (score >= BABY_PASS){
      stars++; status(""); $("bface").textContent = "🎉";
      $("bpic").classList.add("yay"); confetti();
      $("bstars").textContent = "⭐".repeat(Math.min(stars,10)) + (stars>10 ? " +"+(stars-10) : "");
      await speakAsync(pt ? pick(["Muito bem!","Isso!","Parabéns!"]) : pick(["Great job!","Yay!","Awesome!","Good job!"]), lang, 1);
      await wait(500);
      if (!alive(t) || paused) return;
      next();
    } else {
      $("bface").textContent = score >= 70 ? "🙂" : "🤔"; status("");
      await speakAsync(pt ? "De novo!" : "Try again!", lang, 1);
      await wait(300);
      if (!alive(t) || paused) return;
      cycle();
    }
  }
  function next(){
    idx++; tries = 0; turn++;
    if (idx >= list.length){
      setPaused(true);
      $("bpic").innerHTML = `<div class="bpic-emoji">🏆</div>`;
      $("bword").textContent = pt ? "Você conseguiu!" : "You did it!";
      $("bstart").textContent = "🔁";
      speakAsync(pt ? "Você conseguiu!" : "You did it!", lang, 0.9);
      $("bstart").onclick = () => go("babyPlay", catId, true);
      return;
    }
    show(); cycle();
  }
  function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
  function confetti(){
    const box = $("bpic"), em = ["⭐","🎈","✨","🌟","🎊"];
    for (let i=0;i<14;i++){
      const sp = document.createElement("span"); sp.className = "conf"; sp.textContent = pick(em);
      sp.style.left = (10+Math.random()*80)+"%"; sp.style.animationDelay = (Math.random()*0.3)+"s";
      box.appendChild(sp);
    }
  }

  $("bstart").onclick = () => { setPaused(false); $("bmic").classList.add("hidden"); cycle(); };
  $("bpause").onclick = () => setPaused(true);
  $("bskip").onclick = () => { stopListen(); if (synth) synth.cancel(); const p = paused; next(); if (p) setPaused(true); };
  $("bpic").onclick = () => { if (!paused) return; speak(babyWord(list[idx].it), lang, s.rate); };
  // modo manual (quando o iPhone não permite abrir o microfone sozinho)
  $("bmic").onclick = () => {
    if (paused) setPaused(false);
    $("bmic").classList.remove("glow"); status("👂", "ear");
    const item = list[idx].it, t = ++turn;
    listen(lang, (alts, err) => {
      if (err && err !== "no-speech" && err !== "aborted"){ toast("Microfone: " + err, 3500); return; }
      if (err){ status(""); return; }
      onHeard(t, item, alts, null);
    }, () => {});
  };
  show();
  status(""); $("bface").textContent = "";
};
