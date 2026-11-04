// Écran de jeu : affiche la table et relie les boutons au moteur (local, hôte ou invité)
import { $, $$, fmt, esc, sfx, vib, toast } from './util.js';
import { Table, total, isBJ, best, canDouble, canSplit, odds, STAKES } from './engine.js';
import { profile, stats, settings, save, START_BANK } from './store.js';
import * as net from './net.js';

const NAMES = { H: 'Tirer', S: 'Rester', D: 'Doubler', P: 'Séparer' };
let ctl = null, snap = null, pend = 0, lastBet = 0, applied = 0, sent = false, ticker = null, onExit = () => {};
let oddsKey = '';

export const isPlaying = () => !!ctl;
export const hosting = () => !!(ctl && ctl.host);
export const setExit = fn => { onExit = fn; };
const stake = () => STAKES[(snap && snap.stake) || (ctl && ctl.stake) || 0] || STAKES[0];

// ---------- Démarrage ----------
function begin(c) {
  ctl = c; snap = null; pend = 0; applied = 0; sent = false; lastBet = 0; oddsKey = '';
  $('#msg').innerHTML = ''; $('#odds').innerHTML = '';
  clearInterval(ticker); ticker = setInterval(() => snap && snap.deadline && renderControls(), 500);
}

export function startLocal(mode, st = profile.stake) {
  const t = new Table({ online: false, stake: st, onChange: ev => update(t.snapshot(), ev) });
  begin({ mode, stake: st, label: mode === 'train' ? 'Entraî&shy;nement' : STAKES[st].name, myId: 'me', table: t, send: m => apply(t, 'me', m), leave: () => t.stop() });
  setInfo();
  t.addSeat('me', profile.name, profile.avatar);
}

// Héberger une table : les invités se connectent avec notre code
export function startHost(label, extra = {}) {
  const guests = new Map(), me = net.myId(), st = extra.stake ?? profile.stake;
  const t = new Table({
    online: true, stake: st,
    onChange: ev => { const s = t.snapshot(); update(s, ev); guests.forEach(c => { try { c.send({ t: 'state', s, ev }); } catch (e) {} }); },
  });
  net.on('join', c => {
    if (!ctl || ctl.table !== t || !t.addSeat(c.peer, String(c.metadata.name || 'Joueur').slice(0, 16), String(c.metadata.avatar || '🙂').slice(0, 4))) {
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
    mode: 'host', host: true, stake: st, label, myId: me, table: t, guests,
    send: m => apply(t, me, m),
    leave: () => { net.on('join', null); guests.forEach(c => c.close()); t.stop(); extra.onLeave && extra.onLeave(); },
  });
  setInfo();
  t.addSeat(me, profile.name, profile.avatar);
}

// Rejoindre la table d'un autre joueur
export async function startGuest(code, label = 'En ligne') {
  let c;
  try { c = await net.connect(code, { kind: 'join', name: profile.name, avatar: profile.avatar }); }
  catch (e) { toast('Ce joueur est hors ligne', { cls: 'bad' }); return false; }
  begin({ mode: 'guest', label, myId: net.myId(), conn: c, send: m => c.send(m), leave: () => c.close() });
  setInfo();
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
  if (snap.phase === 'bet') return profile.bank - (me.ready ? me.bet : pend);
  return me.out ? profile.bank : profile.bank - wagered(me);
}
function setInfo() { $('#tMode').innerHTML = ctl.label; $$('[data-av]').forEach(e => e.textContent = profile.avatar); }

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
  const n = me.net, bj = me.hands.some(h => h.bj);
  if (n > 0) { msg(bj ? `<b>Blackjack</b> +${fmt(n)}` : `<b>Gagné</b> +${fmt(n)}`, bj ? 'gold' : 'ok'); sfx.win(); vib(30); }
  else if (n < 0) { msg(`<b>Perdu</b> −${fmt(-n)}`, 'bad'); sfx.lose(); }
  else msg('Égalité');
  if (profile.bank < STAKES[0].min) { profile.bank = START_BANK; toast(`Plus de jetons : on te recharge ${fmt(START_BANK)}`); }
  if (lastBet > profile.bank) lastBet = 0;
  save();
}

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
  return `<div class="card${red ? ' red' : ''}${anim}"><div class="r">${c.r}</div><div class="s">${c.s}</div></div>`;
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
    const info = x.out ? 'attend' : s.phase === 'bet' ? (x.ready ? fmt(x.bet) : 'mise…') : h ? handLabel(h) : '';
    return `<div class="pl${turnId === x.id ? ' turn' : ''}${x.out ? ' out' : ''}"><span class="av">${esc(x.avatar || '🙂')}</span><span>${esc(x.name)}</span><b>${info}</b><span class="mini">${x.hands.map(tag).join('')}</span></div>`;
  }).join('') || (ctl.waiting ? '<div class="pl"><span class="av dots"></span><span>Recherche…</span></div>' : '');

  const ph = $('#pHands');
  if (!me || !me.hands.length) { ph.innerHTML = ''; ph.classList.remove('multi'); }
  else {
    ph.classList.toggle('multi', me.hands.length > 1);
    ph.innerHTML = me.hands.map((h, i) => `<div class="hand${(turnId === me.id && i === me.cur) || s.phase !== 'play' ? ' active' : ''}">
      <div class="cards">${h.cards.map((c, j) => cardEl(c, 'me' + i + ':' + j)).join('')}</div>
      <div class="info"><span class="tot">${handLabel(h)}</span><span class="bet"><i class="coin"></i>${fmt(h.bet)}</span>${tag(h)}</div></div>`).join('');
  }
  renderOdds(me, turnId);
  renderControls();
}

// Pourcentage de victoire de la main en cours
function renderOdds(me, turnId) {
  const el = $('#odds');
  if (!settings.odds || !me || !me.hands.length || snap.phase === 'bet' || !snap.dealer.length) { el.innerHTML = ''; oddsKey = ''; return; }
  const h = me.hands[turnId === me.id ? me.cur : 0];
  if (!h || h.res || total(h.cards).t > 21 || snap.phase !== 'play') { if (snap.phase !== 'dealer') { el.innerHTML = ''; oddsKey = ''; } return; }
  const key = h.cards.map(c => c.r).join() + '|' + snap.dealer[0].r;
  if (key === oddsKey) return;
  oddsKey = key;
  const o = isBJ(h) ? { win: 1, push: 0 } : odds(h.cards, snap.dealer[0]);
  if (!o) return;
  const w = Math.round(o.win * 100), p = Math.round(o.push * 100);
  el.innerHTML = `<div class="odds"><span>Victoire <b>${w}%</b></span><span class="bar"><i class="w" style="width:${w}%"></i><i class="p" style="width:${p}%"></i></span><span>Égalité ${p}%</span></div>`;
}

function renderControls() {
  const s = snap, me = mySeat(), lv = stake();
  const show = id => ['#betUI', '#playUI', '#waitUI'].forEach(x => $(x).hidden = x !== id);
  const secs = s && s.deadline ? Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)) : 0;
  const wait = html => { show('#waitUI'); $('#waitUI').innerHTML = html; };
  $('#tBank').textContent = fmt(displayBank());
  if (!s || !me) { $('#meHand').textContent = ''; return wait('<span class="dots">Connexion</span>'); }
  const alone = s.seats.length === 1;

  if (s.phase === 'bet') {
    $('#meHand').textContent = me.ready ? `Mise ${fmt(me.bet)}` : pend ? `Mise ${fmt(pend)}` : 'Solde';
    if (me.ready) return wait(`Mise placée · en attente des joueurs${secs ? ` · ${secs}s` : ''}`);
    if (profile.bank < lv.min) return wait(`Il te faut au moins ${fmt(lv.min)} jetons pour cette table`);
    show('#betUI');
    $('#chips').innerHTML = lv.chips.map(v => `<button class="chip" data-v="${v}" ${v > profile.bank ? 'disabled' : ''}><i></i>${fmtShort(v)}</button>`).join('');
    $$('#chips .chip').forEach(c => c.onclick = () => addBet(+c.dataset.v));
    const ok = pend >= lv.min;
    $('#deal').disabled = !ok;
    $('#deal').textContent = !pend ? `Min ${fmtShort(lv.min)}` : alone ? 'Distribuer' : (secs ? `Miser · ${secs}s` : 'Miser');
    $('#rebet').disabled = !lastBet || lastBet > profile.bank;
    $('#clearBet').disabled = !pend;
    return;
  }
  const h = me.hands[me.cur] || me.hands[0];
  $('#meHand').textContent = me.out ? 'Solde' : `En jeu ${fmt(wagered(me))}`;
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
function addBet(v) {
  const lv = stake();
  if (!ctl || !snap || snap.phase !== 'bet') return;
  if (pend + v > profile.bank) { msg('<b>Solde insuffisant</b>', 'bad'); vib(30); return; }
  if (pend + v > lv.max) { msg(`Mise max <b>${fmt(lv.max)}</b>`, 'bad'); vib(30); return; }
  pend += v; sfx.chip(); vib(6); msg(''); renderControls();
}
function placeBet(amount) {
  const lv = stake();
  if (!ctl || !amount || amount > profile.bank || amount < lv.min || amount > lv.max) return;
  lastBet = amount; pend = 0; msg('');
  ctl.send({ t: 'bet', amount, bank: profile.bank });
}
function act(a) {
  const me = mySeat(); if (!ctl || !me || sent || snap.phase !== 'play' || !snap.seats[snap.turn] || snap.seats[snap.turn].id !== me.id) return;
  const h = me.hands[me.cur], can = { D: canDouble(h, me), P: canSplit(h, me) };
  if ((a === 'D' && !can.D) || (a === 'P' && !can.P)) return;
  if (ctl.mode === 'train' || settings.trainer) {
    const rec = best(h, snap.dealer[0], can.D, can.P);
    stats.dec++;
    if (a === rec) { stats.good++; msg(`<b>✓</b> ${NAMES[a]} · bon coup`, 'ok'); }
    else { msg(`<b>✗ ${NAMES[a]}</b> · il fallait ${NAMES[rec]}`, 'bad'); vib(40); }
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
