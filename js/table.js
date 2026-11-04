// Écran de jeu : affiche la table et relie les boutons au moteur (local, hôte ou invité)
import { $, $$, fmt, esc, sfx, vib, toast } from './util.js';
import { Table, total, val, isBJ, best, canDouble, canSplit } from './engine.js';
import { profile, stats, settings, save, START_BANK } from './store.js';
import * as net from './net.js';

const NAMES = { H: 'Tirer', S: 'Rester', D: 'Doubler', P: 'Séparer' };
let ctl = null, snap = null, pend = 0, lastBet = 0, applied = 0, sent = false, ticker = null, onExit = () => {};

export const isPlaying = () => !!ctl;
export const hosting = () => !!(ctl && ctl.host);
export const setExit = fn => { onExit = fn; };

// ---------- Démarrage ----------
function begin(c) {
  ctl = c; snap = null; pend = 0; applied = 0; sent = false;
  $('#tMode').textContent = c.label;
  $('#msg').innerHTML = '';
  clearInterval(ticker); ticker = setInterval(() => snap && snap.deadline && renderControls(), 500);
}

export function startLocal(mode) {
  const t = new Table({ online: false, onChange: ev => update(t.snapshot(), ev) });
  begin({ mode, label: mode === 'train' ? 'Entraînement' : 'Solo', myId: 'me', table: t, send: m => apply(t, 'me', m), leave: () => t.stop() });
  t.addSeat('me', profile.name);
}

// Héberger un salon : les invités se connectent avec notre code
export function startHost(label, extra = {}) {
  const guests = new Map(), me = net.myId();
  const t = new Table({
    online: true,
    onChange: ev => { const s = t.snapshot(); update(s, ev); guests.forEach(c => { try { c.send({ t: 'state', s, ev }); } catch (e) {} }); },
  });
  net.on('join', c => {
    if (!ctl || ctl.table !== t || !t.addSeat(c.peer, String(c.metadata.name || 'Joueur').slice(0, 16))) {
      c.send({ t: ctl && ctl.table === t ? 'full' : 'nohost' }); return setTimeout(() => c.close(), 600);
    }
    guests.set(c.peer, c);
    toast(`<b>${esc(c.metadata.name)}</b> a rejoint la table`);
    extra.onJoin && extra.onJoin();
    c.send({ t: 'state', s: t.snapshot() });
    c.on('data', m => apply(t, c.peer, m));
    c.on('close', () => { guests.delete(c.peer); if (ctl && ctl.table === t) { t.removeSeat(c.peer); toast(`${esc(c.metadata.name)} a quitté la table`); } });
  });
  begin({
    mode: 'host', host: true, label, myId: me, table: t, guests,
    send: m => apply(t, me, m),
    leave: () => { net.on('join', null); guests.forEach(c => c.close()); t.stop(); extra.onLeave && extra.onLeave(); },
  });
  t.addSeat(me, profile.name);
}

// Rejoindre le salon d'un autre joueur
export async function startGuest(code, label = 'En ligne') {
  let c;
  try { c = await net.connect(code, { kind: 'join', name: profile.name }); }
  catch (e) { toast('Ce joueur est hors ligne', { cls: 'bad' }); return false; }
  begin({ mode: 'guest', label, myId: net.myId(), conn: c, send: m => c.send(m), leave: () => c.close() });
  c.on('data', d => {
    if (d.t === 'state') update(d.s, d.ev);
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
}

export function exit(silent) {
  if (!ctl) return;
  const me = mySeat();
  if (me && snap && snap.phase !== 'bet' && !me.out) profile.bank -= wagered(me); // partir en pleine main = mise perdue
  const c = ctl; ctl = null; snap = null;
  clearInterval(ticker);
  try { c.leave(); } catch (e) {}
  save(); onExit(silent);
}

// ---------- État ----------
const mySeat = () => snap && ctl && snap.seats.find(s => s.id === ctl.myId);
const wagered = s => s.hands.reduce((a, h) => a + h.bet, 0);
function displayBank() {
  const me = mySeat();
  if (!me || !snap) return profile.bank;
  if (snap.phase === 'bet') return profile.bank - (me.ready ? me.bet : 0);
  return me.out ? profile.bank : profile.bank - wagered(me);
}

function update(s, ev) {
  if (!ctl) return;
  snap = s; sent = false;
  if (ev === 'card' || ev === 'flip') sfx.card();
  settle();
  render();
}

function settle() {
  const me = mySeat();
  if (!me || snap.phase !== 'bet' || me.net == null || snap.round <= applied) return;
  applied = snap.round;
  profile.bank += me.net;
  for (const h of me.hands) {
    stats.hands++;
    if (h.res === 'win') { stats.won++; stats.streak++; if (h.bj) stats.bj++; }
    else if (h.res === 'push') stats.push++;
    else { stats.lost++; stats.streak = 0; }
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  }
  if (ctl.mode === 'host' || ctl.mode === 'guest') stats.online++;
  const n = me.net;
  if (n > 0) { msg(`<b>Gagné</b> +${fmt(n)}`, 'ok'); sfx.win(); vib(30); }
  else if (n < 0) { msg(`<b>Perdu</b> −${fmt(-n)}`, 'bad'); sfx.lose(); }
  else msg('Égalité');
  if (profile.bank < 1) { profile.bank = START_BANK; toast(`Plus de jetons : on te recharge ${fmt(START_BANK)}`); }
  if (lastBet > profile.bank) lastBet = 0;
  save();
}

const msg = (html, cls = '') => { $('#msg').innerHTML = html ? `<div class="toast ${cls}">${html}</div>` : ''; };

// ---------- Rendu ----------
function cardEl(c) {
  if (!c || c.back) return '<div class="card back"></div>';
  const red = c.s === '♥' || c.s === '♦';
  return `<div class="card${red ? ' red' : ''}"><div class="r">${c.r}</div><div class="s">${c.s}</div><div class="big">${c.s}</div></div>`;
}
function scoreHTML(cards, h) {
  const { t, soft } = total(cards);
  if (!cards.length) return '';
  const bj = h && isBJ(h);
  const txt = bj ? 'BJ' : (soft && t < 21 && !(h && h.done) ? `${t - 10}/${t}` : t);
  return `<span class="score${t > 21 ? ' bust' : bj ? ' bj' : ''}">${txt}</span>`;
}
const resHTML = h => h.res ? `<span class="result ${h.res}">${h.res === 'win' ? '+' + fmt(h.gain) : h.res === 'lose' ? '−' + fmt(h.bet) : '='}</span>` : '';

function render() {
  const s = snap; if (!s || !ctl) return;
  const me = mySeat();
  $('#tBank').textContent = fmt(displayBank());

  $('#dCards').innerHTML = s.dealer.map(cardEl).join('');
  const ds = $('#dScore');
  if (!s.dealer.length) { ds.textContent = '–'; ds.className = 'score'; }
  else { const t = total(s.dealer).t, bj = !s.hole && s.dealer.length === 2 && t === 21; ds.textContent = bj ? 'BJ' : t; ds.className = 'score' + (t > 21 ? ' bust' : bj ? ' bj' : ''); }

  const turnId = s.phase === 'play' && s.seats[s.turn] ? s.seats[s.turn].id : null;
  $('#others').innerHTML = s.seats.filter(x => x.id !== ctl.myId).map(x => {
    const h = x.hands[x.cur] || x.hands[0];
    const status = x.out ? 'attend' : s.phase === 'bet' ? (x.ready ? `● ${fmt(x.bet)}` : 'mise…') : '';
    return `<div class="seat${turnId === x.id ? ' turn' : ''}"><div class="nm">${esc(x.name)}</div>
      ${x.hands.length ? x.hands.map(hh => `<div class="cards">${hh.cards.map(cardEl).join('')}</div>`).join('') : '<div class="cards"></div>'}
      <div class="meta">${h ? scoreHTML(h.cards, h) : ''}${x.hands.map(resHTML).join('')}${status}</div></div>`;
  }).join('');

  const ph = $('#pHands');
  if (!me) { ph.innerHTML = ''; }
  else {
    ph.classList.toggle('multi', me.hands.length > 1);
    ph.innerHTML = me.hands.map((h, i) => `<div class="hand${turnId === me.id && i === me.cur && me.hands.length > 1 ? ' active' : ''}">
      <div class="cards">${h.cards.map(cardEl).join('')}</div>
      <div class="label">${scoreHTML(h.cards, h)}<span class="betchip">● ${fmt(h.bet)}</span>${resHTML(h)}</div></div>`).join('')
      || `<div class="hand"><div class="cards"></div><div class="label">${esc(profile.name)}</div></div>`;
  }
  renderControls();
}

function renderControls() {
  const s = snap, me = mySeat();
  const show = id => ['#betUI', '#playUI', '#waitUI'].forEach(x => $(x).hidden = x !== id);
  const secs = s && s.deadline ? Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)) : 0;
  const wait = html => { show('#waitUI'); $('#waitUI').innerHTML = html; };
  if (!s || !me) return wait('<span class="dots">Connexion</span>');
  const alone = s.seats.length === 1;
  const waitMsg = ctl.waiting && alone ? '<span class="dots">Recherche d\'un adversaire</span> · tu peux jouer en attendant' : '';

  if (s.phase === 'bet') {
    if (me.ready) return wait(`Mise placée · en attente des autres joueurs${secs ? ` (${secs}s)` : ''}`);
    show('#betUI');
    $('#betAmt').textContent = fmt(pend);
    $('#deal').disabled = pend <= 0;
    $('#deal').textContent = alone ? 'Distribuer' : (secs ? `Miser (${secs}s)` : 'Miser');
    $('#rebet').disabled = !lastBet || lastBet > profile.bank;
    $('#rebet').textContent = lastBet ? `Remiser ${fmt(lastBet)}` : 'Remiser';
    if (waitMsg && !$('#msg').innerHTML) msg(waitMsg);
    return;
  }
  if (s.phase === 'play' && s.seats[s.turn] && s.seats[s.turn].id === me.id && !sent) {
    show('#playUI');
    const h = me.hands[me.cur], can = { H: true, S: true, D: canDouble(h, me), P: canSplit(h, me) };
    const rec = best(h, s.dealer[0], can.D, can.P);
    $$('[data-a]').forEach(b => { b.disabled = !can[b.dataset.a]; b.classList.toggle('hint', settings.hints && b.dataset.a === rec); });
    return;
  }
  if (me.out) return wait('Tu joues à la prochaine main');
  if (s.phase === 'play' && s.seats[s.turn]) return wait(`Au tour de <b>&nbsp;${esc(s.seats[s.turn].name)}&nbsp;</b>${secs ? ` · ${secs}s` : ''}`);
  wait('<span class="dots">Croupier</span>');
}

// ---------- Actions du joueur ----------
function addBet(v) {
  if (!ctl || !snap || snap.phase !== 'bet') return;
  if (pend + v > profile.bank) { msg('<b>Solde insuffisant</b>', 'bad'); vib(30); return; }
  pend += v; sfx.chip(); msg(''); renderControls();
}
function placeBet(amount) {
  if (!ctl || !amount || amount > profile.bank) return;
  lastBet = amount; pend = 0; msg('');
  ctl.send({ t: 'bet', amount, bank: profile.bank });
}
function act(a) {
  const me = mySeat(); if (!ctl || !me || sent || snap.phase !== 'play') return;
  const h = me.hands[me.cur], can = { D: canDouble(h, me), P: canSplit(h, me) };
  if ((a === 'D' && !can.D) || (a === 'P' && !can.P)) return;
  if (ctl.mode === 'train' || settings.trainer) {
    const rec = best(h, snap.dealer[0], can.D, can.P);
    stats.dec++;
    if (a === rec) { stats.good++; msg(`<b>✓ Bien joué</b> · ${NAMES[a]}`, 'ok'); }
    else { msg(`<b>✗ Erreur</b> · la stratégie dit <b>${NAMES[rec]}</b>`, 'bad'); vib(40); }
  }
  sent = true; renderControls();
  ctl.send({ t: 'act', a });
}

$$('.chip').forEach(c => c.onclick = () => addBet(+c.dataset.v));
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

export function setWaiting(on) { if (ctl) { ctl.waiting = on; if (!on) msg(''); renderControls(); } }
