// Écran de jeu : affiche la table et relie les boutons au moteur (local, hôte ou invité)
import { $, $$, fmt, esc, sfx, vib, toast, sheet, closeSheet } from './util.js';
import { avHTML, paintAv, nameHTML, myPub, cleanPub } from './cosmetics.js';
import { weekKey } from './auth.js';
import { Table, total, isBJ, best, canDouble, canSplit, odds, STAKES, TOUR } from './engine.js';
import { profile, stats, settings, save, START_BANK } from './store.js';
import * as net from './net.js';
import { checkAch } from './achievements.js';

export const REACTS = ['GG', 'Bien joué', 'Aïe', 'Allez', 'Chanceux', 'Encore !', 'Merci', 'Wow'];
const reacts = new Map();

const NAMES = { H: 'Tirer', S: 'Rester', D: 'Doubler', P: 'Séparer' };
let ctl = null, snap = null, pend = 0, lastBet = 0, applied = 0, sent = false, ticker = null, onExit = () => {};
let oddsKey = '', onSettle = () => {};
export const setOnSettle = fn => { onSettle = fn; };

export const isPlaying = () => !!ctl;
export const hosting = () => !!(ctl && ctl.host);
export const setExit = fn => { onExit = fn; };
const stake = () => STAKES[(snap && snap.stake) || (ctl && ctl.stake) || 0] || STAKES[0];

// ---------- Démarrage ----------
function begin(c) {
  ctl = c; snap = null; pend = 0; applied = 0; sent = false; lastBet = 0; oddsCache = { key: '', o: null }; potShown = 0; reacts.clear();
  $('#reactBar').hidden = true; $('#reactBtn').hidden = !(c.host || c.mode === 'guest');
  $('#msg').innerHTML = ''; $('#pot').innerHTML = '';
  clearInterval(ticker); ticker = setInterval(() => snap && snap.deadline && renderControls(), 500);
}

export function startLocal(mode, st = profile.stake) {
  const t = new Table({ online: false, stake: st, onChange: ev => update(t.snapshot(), ev) });
  begin({ mode, stake: st, label: mode === 'train' ? 'Entraî&shy;nement' : STAKES[st].name, myId: 'me', table: t, send: m => apply(t, 'me', m), leave: () => t.stop() });
  setInfo();
  t.addSeat('me', profile.name, myPub());
}

// Héberger une table : les invités se connectent avec notre code
export function startHost(label, extra = {}) {
  const guests = new Map(), me = net.myId(), st = extra.tour ? 5 : (extra.stake ?? profile.stake);
  const t = new Table({
    online: true, stake: st, tour: extra.tour ? { ...TOUR } : null,
    onChange: ev => { const s = t.snapshot(); update(s, ev); guests.forEach(c => { try { c.send({ t: 'state', s, ev }); } catch (e) {} }); },
  });
  net.on('join', c => {
    if (!ctl || ctl.table !== t || !t.addSeat(c.peer, String(c.metadata.name || 'Joueur').slice(0, 16), cleanPub(c.metadata.pub))) {
      c.send({ t: ctl && ctl.table === t ? 'full' : 'nohost' }); return setTimeout(() => c.close(), 600);
    }
    guests.set(c.peer, c);
    toast(`<b>${esc(c.metadata.name)}</b> a rejoint la table`);
    extra.onJoin && extra.onJoin();
    c.send({ t: 'state', s: t.snapshot() });
    c.on('data', m => apply(t, c.peer, m));
    c.on('close', () => { guests.delete(c.peer); if (ctl && ctl.table === t) { t.removeSeat(c.peer); toast(`${esc(c.metadata.name)} a quitté la table`); } });
  });
  t.onReact = (id, i) => { guests.forEach(c => { try { c.send({ t: 'react', id, i }); } catch (e) {} }); showReact(id, i); };
  begin({
    mode: 'host', host: true, stake: st, label, myId: me, table: t, guests,
    send: m => apply(t, me, m),
    leave: () => { net.on('join', null); guests.forEach(c => c.close()); t.stop(); extra.onLeave && extra.onLeave(); },
  });
  setInfo();
  t.addSeat(me, profile.name, myPub());
}

// Rejoindre la table d'un autre joueur
export async function startGuest(code, label = 'En ligne') {
  let c;
  try { c = await net.connect(code, { kind: 'join', name: profile.name, pub: myPub() }); }
  catch (e) { toast('Ce joueur est hors ligne', { cls: 'bad' }); return false; }
  begin({ mode: 'guest', label, myId: net.myId(), conn: c, send: m => c.send(m), leave: () => c.close() });
  setInfo();
  c.on('data', d => {
    if (d.t === 'state') update(d.s, d.ev);
    else if (d.t === 'react') showReact(d.id, d.i);
    else if (d.t === 'full') { toast('La table est complète', { cls: 'bad' }); exit(true); }
    else if (d.t === 'nohost') { toast("Ce joueur n'a pas de table ouverte", { cls: 'bad' }); exit(true); }
  });
  c.on('close', () => { if (ctl && ctl.conn === c) { toast("L'hôte a quitté la table"); exit(true); } });
  return true;
}

function apply(t, id, m) {
  if (!m) return;
  if (m.t === 'bet') t.bet(id, +m.amount, +m.bank);
  else if (m.t === 'act') t.act(id, m.a);
  else if (m.t === 'react' && t.onReact && REACTS[m.i]) t.onReact(id, m.i);
  else if (m.t === 'start' && t.online && ctl && ctl.host && id === ctl.myId) t.startTour();
}

export function exit(silent) {
  if (!ctl) return;
  const me = mySeat();
  if (me && snap && !snap.tour && snap.phase !== 'bet' && !me.out) profile.bank -= wagered(me); // partir en pleine main = mise perdue
  const c = ctl; ctl = null; snap = null;
  clearInterval(ticker);
  try { c.leave(); } catch (e) {}
  save(); onExit(silent);
}

// ---------- État ----------
const mySeat = () => snap && ctl && snap.seats.find(s => s.id === ctl.myId);
const wagered = s => s.hands.reduce((a, h) => a + h.bet, 0);
const avail = () => { const me = mySeat(); return snap && snap.tour ? (me ? me.tbank : 0) : profile.bank; };
function displayBank() {
  const me = mySeat(), base = avail();
  if (!me || !snap) return base;
  if (snap.phase === 'bet' || snap.phase === 'lobby') return base - (me.ready ? me.bet : pend);
  if (snap.phase === 'over') return base;
  return me.out ? base : base - wagered(me);
}
function setInfo() { $('#tMode').innerHTML = snap && snap.tour ? `Main<br>${Math.min(snap.tour.hands, snap.round + (snap.phase === 'bet' ? 1 : 0))}/${snap.tour.hands}` : ctl.label; $$('[data-av]').forEach(e => paintAv(e, myPub())); }

function update(s, ev) {
  if (!ctl) return;
  snap = s; sent = false;
  if (ev === 'card' || ev === 'flip') sfx.card();
  settle();
  if (s.tour) setInfo();
  render();
  if (s.phase === 'over' && !ctl.overShown) { ctl.overShown = true; setTimeout(showRanking, 900); }
}

function settle() {
  const me = mySeat();
  if (!me || (snap.phase !== 'bet' && snap.phase !== 'over') || me.net == null || snap.round <= applied) return;
  applied = snap.round;
  { const pot = $('#pot'), col = chipColor(Math.max(1, wagered(me)));
    if (me.net > 0) fly(pot, $('#dock .mebox'), col); else if (me.net < 0) fly(pot, $('#dCards'), col); }
  if (!snap.tour) {
    profile.bank += me.net;
    const wk = weekKey(); if (stats.week !== wk) { stats.week = wk; stats.weekNet = 0; }
    stats.weekNet += me.net;
  }
  stats.dblWon = (stats.dblWon || 0) + me.hands.filter(h => h.dbl && h.res === 'win').length;
  for (const h of me.hands) {
    stats.hands++;
    if (h.res === 'win') { stats.won++; stats.streak++; if (h.bj) stats.bj++; }
    else if (h.res === 'push') stats.push++;
    else { stats.lost++; stats.streak = 0; }
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  }
  if (ctl.mode === 'host' || ctl.mode === 'guest') stats.online++;
  const n = me.net, bj = me.hands.some(h => h.bj);
  if (n > 0) { msg(bj ? `<b>Blackjack</b> +${fmt(n)}` : `<b>Gagné</b> +${fmt(n)}`, 'ok'); sfx.win(); vib(30); }
  else if (n < 0) { msg(`<b>Perdu</b> −${fmt(-n)}`, 'bad'); sfx.lose(); }
  else msg('Égalité');
  if (!snap.tour && profile.bank < STAKES[0].min) { profile.bank = START_BANK; toast(`Plus de jetons : on te recharge ${fmt(START_BANK)}`); }
  if (lastBet > avail()) lastBet = 0;
  save(); checkAch(); onSettle();
}

function showRanking() {
  if (!ctl || !snap) return;
  const list = [...snap.seats].sort((a, b) => b.tbank - a.tbank), me = mySeat();
  const won = me && list.length > 1 && me.tbank === list[0].tbank;
  stats.tours++;
  if (won) { stats.tourWins++; profile.bank += snap.tour.prize; sfx.win(); }
  save(); checkAch();
  const el = sheet(`<h2>${won ? 'Tu gagnes le tournoi' : 'Tournoi terminé'}</h2><p>${won ? `+${fmt(snap.tour.prize)} jetons ajoutés à ton solde.` : 'Bien joué. Retente ta chance !'}</p>
    <div class="rank">${list.map((x, i) => `<div><span class="pos">${i + 1}</span>${avHTML(x.avatar, x.name)}<span class="nm">${nameHTML(x.name, x.avatar)}</span><b>${fmt(x.tbank)}</b></div>`).join('')}</div>
    <button class="btn white full" id="tourOk">Quitter la table</button>`);
  el.querySelector('#tourOk').onclick = () => { closeSheet(); exit(true); };
}

// ---------- Réactions rapides ----------
function showReact(id, i) {
  if (!REACTS[i]) return;
  reacts.set(id, { text: REACTS[i], until: Date.now() + 2600 });
  sfx.tap(); render();
  setTimeout(render, 2700);
}
const bubble = id => { const r = reacts.get(id); return r && r.until > Date.now() ? `<span class="bubble">${esc(r.text)}</span>` : ''; };
let lastReact = 0;
$('#reactBtn').onclick = () => {
  const bar = $('#reactBar');
  bar.hidden = !bar.hidden;
  if (!bar.hidden) {
    bar.innerHTML = REACTS.map((r, i) => `<button data-r="${i}">${r}</button>`).join('');
    $$('[data-r]').forEach(b => b.onclick = () => { if (Date.now() - lastReact < 1500 || !ctl) return; lastReact = Date.now(); ctl.send({ t: 'react', i: +b.dataset.r }); bar.hidden = true; });
  }
};

const msg = (html, cls = '') => { $('#msg').innerHTML = html ? `<div class="toast ${cls}">${html}</div>` : ''; };

// ---------- Rendu ----------
let seen = new Set(), seenRound = -1;
function cardEl(c, key) {
  const k = key + (!c || c.back ? 'b' : c.r + c.s), fresh = !seen.has(k);
  const flip = fresh && c && !c.back && seen.has(key + 'b');
  seen.add(k);
  const anim = flip ? ' flip' : fresh ? ' in' : '';
  if (!c || c.back) return `<div class="card back${anim}"></div>`;
  const red = c.s === '♥' || c.s === '♦';
  return `<div class="card${red ? ' red' : ''}${anim}"><div class="r">${c.r}</div><div class="s">${c.s}\uFE0E</div></div>`;
}
function handLabel(h) {
  const { t, soft } = total(h.cards);
  if (!h.cards.length) return '';
  if (isBJ(h)) return 'Blackjack';
  if (t > 21) return 'Sauté';
  return soft && t < 21 && !h.done ? `${t - 10} / ${t}` : String(t);
}
const tag = h => !h.res ? '' : h.bj ? '<span class="tag bj">BJ</span>' : h.res === 'win' ? `<span class="tag w">+${fmt(h.gain)}</span>` : h.res === 'lose' ? `<span class="tag l">−${fmt(h.bet)}</span>` : '<span class="tag">=</span>';

function render() {
  const s = snap; if (!s || !ctl) return;
  const me = mySeat();
  if (s.round !== seenRound) { seenRound = s.round; seen = new Set(); }

  $('#dCards').innerHTML = s.dealer.map((c, i) => cardEl(c, 'd' + i)).join('');
  const ds = $('#dScore');
  if (!s.dealer.length) { ds.textContent = ''; ds.className = 'dtotal'; }
  else { const t = total(s.dealer).t, bj = !s.hole && s.dealer.length === 2 && t === 21; ds.textContent = bj ? 'BJ' : t; ds.className = 'dtotal' + (t > 21 ? ' bust' : bj ? ' bj' : ''); }

  const turnId = s.phase === 'play' && s.seats[s.turn] ? s.seats[s.turn].id : null;
  $('#others').innerHTML = s.seats.filter(x => x.id !== ctl.myId).map(x => {
    const h = x.hands[x.cur] || x.hands[0];
    const info = s.phase === 'lobby' || s.phase === 'over' ? (s.tour ? fmt(x.tbank) : '') : x.out ? 'attend' : s.phase === 'bet' ? (x.ready ? fmt(x.bet) : s.tour ? fmt(x.tbank) : 'mise…') : h ? handLabel(h) : '';
    return `<div class="pl${turnId === x.id ? ' turn' : ''}${x.out ? ' out' : ''}" data-pid="${esc(x.id)}">${bubble(x.id)}${avHTML(x.avatar, x.name)}${nameHTML(x.name, x.avatar)}<b>${info}</b><span class="mini">${x.hands.map(tag).join('')}</span></div>`;
  }).join('') || (ctl.waiting ? '<div class="pl"><span class="av dots"></span><span>Recherche…</span></div>' : '');

  const ph = $('#pHands');
  if (!me || !me.hands.length) { ph.innerHTML = ''; ph.classList.remove('multi'); }
  else {
    ph.classList.toggle('multi', me.hands.length > 1);
    ph.innerHTML = me.hands.map((h, i) => `<div class="hand${(turnId === me.id && i === me.cur) || s.phase !== 'play' ? ' active' : ''}">
      <div class="cards">${h.cards.map((c, j) => cardEl(c, 'me' + i + ':' + j)).join('')}</div>
      <div class="info"><span class="tot">${handLabel(h)}</span>${tag(h)}</div></div>`).join('');
  }
  const mb = $('#meBubble'), r = bubble(ctl.myId);
  mb.hidden = !r; if (r) mb.textContent = reacts.get(ctl.myId).text;
  renderControls();
}

// ---------- Case du joueur : chances de victoire pendant la main, solde sinon ----------
let oddsCache = { key: '', o: null };
function curOdds(me) {
  if (!snap || !me || !me.hands.length || !snap.dealer.length || !['play', 'dealer'].includes(snap.phase)) return null;
  const turnId = snap.phase === 'play' && snap.seats[snap.turn] ? snap.seats[snap.turn].id : null;
  const h = me.hands[turnId === me.id ? me.cur : 0];
  if (!h || h.res || h.cards.length < 2) return null;
  if (total(h.cards).t > 21) return { w: 0, p: 0 };
  const key = h.cards.map(c => c.r).join() + '|' + snap.dealer[0].r;
  if (key !== oddsCache.key) {
    const o = isBJ(h) ? { win: 1, push: 0 } : odds(h.cards, snap.dealer[0]);
    oddsCache = { key, o: o && { w: Math.round(o.win * 100), p: Math.round(o.push * 100) } };
  }
  return oddsCache.o;
}
function renderMe() {
  const me = mySeat();
  const set = (a, b, c, d, cls = '') => { $('#mbL1').textContent = a; const v = $('#mbV1'); v.textContent = b; v.className = cls; $('#mbL2').textContent = c; $('#mbV2').textContent = d; };
  if (!snap || !me) return set('Solde', fmt(avail()), 'Mise', '0');
  const o = settings.odds ? curOdds(me) : null;
  if (o) return set('Victoire', o.w + '%', 'Égalité', o.p + '%', o.w < 25 ? 'lo' : o.w >= 50 ? 'hi' : '');
  if (snap.phase === 'bet' || snap.phase === 'lobby') return set('Solde', fmt(displayBank()), 'Mise', fmt(me.ready ? me.bet : pend));
  set('Solde', fmt(displayBank()), 'En jeu', me.out ? '0' : fmt(wagered(me)));
}

// ---------- Jetons au centre de la table ----------
const CHIP_COLORS = ['#f5f5f7', '#ff453a', '#64d2ff', '#bf5af2'];
const chipColor = amount => { const c = stake().chips; let k = 0; c.forEach((v, i) => { if (amount >= v) k = i; }); return CHIP_COLORS[k]; };
let potShown = 0;
function renderPot() {
  const me = mySeat(), el = $('#pot');
  if (!snap || !me) { el.innerHTML = ''; potShown = 0; return; }
  const amount = snap.phase === 'bet' || snap.phase === 'lobby' ? (me.ready ? me.bet : pend) : snap.phase === 'over' || me.out ? 0 : wagered(me);
  if (amount === potShown) return;
  potShown = amount;
  el.innerHTML = amount ? `<span class="potchip" style="--c:${chipColor(amount)}"></span><b>${fmt(amount)}</b>` : '';
  if (amount) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
// Un jeton qui vole d'un élément à un autre
function fly(from, to, color) {
  if (!from || !to) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const d = document.createElement('span');
  d.className = 'flychip'; d.style.setProperty('--c', color);
  d.style.left = (a.left + a.width / 2 - 20) + 'px'; d.style.top = (a.top + a.height / 2 - 20) + 'px';
  document.body.appendChild(d);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = d.animate([{ transform: 'translate(0,0) scale(.9)', opacity: 1 }, { transform: `translate(${dx * .5}px,${dy * .5 - 40}px) scale(1.1)`, opacity: 1, offset: .5 }, { transform: `translate(${dx}px,${dy}px) scale(.8)`, opacity: .9 }],
    { duration: 480, easing: 'cubic-bezier(.3,.7,.3,1)' });
  anim.onfinish = () => d.remove();
}

function renderControls() {
  const s = snap, me = mySeat(), lv = stake();
  const show = id => ['#betUI', '#playUI', '#waitUI'].forEach(x => $(x).hidden = x !== id);
  const secs = s && s.deadline ? Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)) : 0;
  const wait = html => { show('#waitUI'); $('#waitUI').innerHTML = html; };
  renderMe(); renderPot();
  if (!s || !me) return wait('<span class="dots">Connexion</span>');
  const alone = s.seats.length === 1, bank = avail();
  if (s.phase === 'lobby') {
    if (!ctl.host) return wait("En attente du lancement par l'hôte");
    wait(`${s.seats.length} joueur${s.seats.length > 1 ? 's' : ''} · code <b>&nbsp;${esc(profile.code)}&nbsp;</b><button class="btn sm white" id="startTour">Lancer</button>`);
    $('#startTour').onclick = () => ctl.send({ t: 'start' });
    return;
  }
  if (s.phase === 'over') return wait('Tournoi terminé');

  if (s.phase === 'bet') {
    if (me.ready) return wait(`Mise placée · en attente des joueurs${secs ? ` · ${secs}s` : ''}`);
    if (bank < lv.min) return wait(s.tour ? 'Éliminé · plus assez de jetons' : `Il te faut au moins ${fmt(lv.min)} jetons pour cette table`);
    show('#betUI');
    $('#chips').innerHTML = lv.chips.map(v => `<button class="chip" data-v="${v}" ${v > bank ? 'disabled' : ''}><i></i>${fmtShort(v)}</button>`).join('');
    $$('#chips .chip').forEach(c => c.onclick = e => addBet(+c.dataset.v, e.currentTarget));
    const ok = pend >= lv.min;
    $('#deal').disabled = !ok;
    $('#deal').textContent = !pend ? `Min ${fmtShort(lv.min)}` : alone ? 'Distribuer' : (secs ? `Miser · ${secs}s` : 'Miser');
    $('#rebet').disabled = !lastBet || lastBet > bank;
    $('#clearBet').disabled = !pend;
    return;
  }
  const h = me.hands[me.cur] || me.hands[0];
  if (s.phase === 'play' && s.seats[s.turn] && s.seats[s.turn].id === me.id && !sent) {
    show('#playUI');
    const can = { H: true, S: true, D: canDouble(h, me), P: canSplit(h, me) };
    const rec = best(h, s.dealer[0], can.D, can.P);
    $$('[data-a]').forEach(b => { b.disabled = !can[b.dataset.a]; b.classList.toggle('hint', settings.hints && b.dataset.a === rec); });
    return;
  }
  if (me.out) return wait('Tu joues à la prochaine main');
  if (s.phase === 'play' && s.seats[s.turn]) return wait(`Au tour de ${esc(s.seats[s.turn].name)}${secs ? ` · ${secs}s` : ''}`);
  wait('<span class="dots">Croupier</span>');
}
const fmtShort = v => v >= 1000 ? (v / 1000) + 'k' : String(v);

// ---------- Actions du joueur ----------
function addBet(v, from) {
  const lv = stake();
  if (!ctl || !snap || snap.phase !== 'bet') return;
  if (pend + v > avail()) { msg('<b>Solde insuffisant</b>', 'bad'); vib(30); return; }
  if (pend + v > lv.max) { msg(`Mise max <b>${fmt(lv.max)}</b>`, 'bad'); vib(30); return; }
  fly(from, $('#pot'), CHIP_COLORS[stake().chips.indexOf(v)] || CHIP_COLORS[0]);
  pend += v; sfx.chip(); vib(6); msg(''); setTimeout(renderControls, 380);
}
function placeBet(amount) {
  const lv = stake();
  if (!ctl || !amount || amount > avail() || amount < lv.min || amount > lv.max) return;
  lastBet = amount; pend = 0; msg('');
  ctl.send({ t: 'bet', amount, bank: avail() });
}
function act(a) {
  const me = mySeat(); if (!ctl || !me || sent || snap.phase !== 'play' || !snap.seats[snap.turn] || snap.seats[snap.turn].id !== me.id) return;
  const h = me.hands[me.cur], can = { D: canDouble(h, me), P: canSplit(h, me) };
  if ((a === 'D' && !can.D) || (a === 'P' && !can.P)) return;
  if (ctl.mode === 'train' || settings.trainer) {
    const rec = best(h, snap.dealer[0], can.D, can.P);
    stats.dec++;
    if (a === rec) { stats.good++; msg(`<b>Bon coup</b> · ${NAMES[a]}`, 'ok'); }
    else { msg(`<b>Erreur</b> · il fallait ${NAMES[rec]}`, 'bad'); vib(40); }
  }
  sent = true; sfx.tap(); renderControls();
  ctl.send({ t: 'act', a });
}

$('#clearBet').onclick = () => { pend = 0; renderControls(); };
$('#rebet').onclick = () => placeBet(lastBet);
$('#deal').onclick = () => placeBet(pend);
$$('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
document.addEventListener('keydown', e => {
  if (!ctl || !$('#sheet').hidden || e.target.tagName === 'INPUT') return;
  const k = e.key.toUpperCase();
  if ('HSDP'.includes(k) && k.length === 1) act(k);
  else if (k === 'ENTER' || k === ' ') { e.preventDefault(); if (snap && snap.phase === 'bet') placeBet(pend || lastBet); }
});

export function setWaiting(on) { if (ctl) { ctl.waiting = on; render(); } }

// ---------- Fiche de statistiques (appui sur un avatar) ----------
const DEALER_BUST = { 2: 35, 3: 38, 4: 40, 5: 43, 6: 42, 7: 26, 8: 24, 9: 23, 10: 21, 11: 12 };
function bustIfHit(cards) {
  const { t, soft } = total(cards);
  if (soft || t <= 11) return 0;
  let n = 0; for (let v = 1; v <= 13; v++) if (t + Math.min(v, 10) > 21) n++;
  return Math.round(100 * n / 13);
}
const statCell = (label, value, cls = '') => `<div class="sc-cell"><small>${label}</small><b class="${cls}">${value}</b></div>`;
function showStats(seat) {
  if (!snap || !seat) return;
  const pub = seat.avatar || {}, mine = seat.id === ctl.myId;
  const h = seat.hands[seat.cur] || seat.hands[0];
  let cells = '';
  if (mine && h && h.cards.length >= 2 && snap.dealer.length && !h.res) {
    const o = isBJ(h) ? { win: 1, push: 0 } : odds(h.cards, snap.dealer[0]);
    const up = snap.dealer[0].r === 'A' ? 11 : ['J', 'Q', 'K', '10'].includes(snap.dealer[0].r) ? 10 : +snap.dealer[0].r;
    cells = statCell('Victoire', Math.round((o ? o.win : 0) * 100) + '%', 'hi') + statCell('Sauter si tu tires', bustIfHit(h.cards) + '%')
      + statCell('Croupier saute', (DEALER_BUST[up] || 0) + '%') + statCell('Main', handLabel(h));
  } else if (mine) {
    cells = statCell('Victoire', (stats.hands ? Math.round(100 * stats.won / stats.hands) : 0) + '%', 'hi') + statCell('Blackjacks', fmt(stats.bj)) + statCell('Mains jouées', fmt(stats.hands)) + statCell('Niveau', pub.lvl || 1);
  } else {
    cells = statCell('Niveau', pub.lvl || 1, 'hi') + statCell('Mains gagnées', (pub.wr || 0) + '%') + statCell('Mains jouées', fmt(pub.hands || 0)) + statCell('Blackjacks', fmt(pub.bj || 0));
  }
  sheet(`<div class="statsheet">${avHTML(pub, seat.name, 'lg')}${nameHTML(seat.name, pub)}${pub.title ? `<small class="ptitle">${esc(pub.title)}</small>` : ''}
    <small class="muted">${mine && h && h.cards.length >= 2 && !h.res ? 'Ta main en cours' : mine ? 'Toi' : 'Niveau ' + (pub.lvl || 1)} · ${snap.tour ? fmt(seat.tbank) + ' jetons de tournoi' : mine ? fmt(profile.bank) + ' jetons' : ''}</small>
    <div class="sc-grid">${cells}</div></div>`);
}
$('#dock .mebox').addEventListener('click', () => showStats(mySeat()));
$('#others').addEventListener('click', e => { const p = e.target.closest('[data-pid]'); if (p && snap) showStats(snap.seats.find(x => x.id === p.dataset.pid)); });
