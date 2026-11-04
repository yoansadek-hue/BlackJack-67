// Application : navigation, barre d'onglets, accueil, boutique, amis, profil, réglages
import { $, $$, fmt, esc, toast, sheet, closeSheet, sfx, vib } from './util.js';
import { SHOP_TABS, ALL_GROUPS, AVATAR_CATS, avHTML, paintAv, nameHTML, myPub, cleanPub, owns, equipped, equip, ownKey, reqOf, level } from './cosmetics.js';
import { profile, stats, settings, friends, save, resetAll, ALPHA } from './store.js';
import { STAKES } from './engine.js';
import { checkAch, achHTML, ACH, TIERS } from './achievements.js';
import * as net from './net.js';
import * as table from './table.js';
import * as auth from './auth.js';

// ---------- Apparence ----------
function applyLook() { document.body.dataset.back = profile.back; document.body.dataset.felt = profile.cos.felt || 'noir'; $$('[data-av]').forEach(e => paintAv(e, myPub())); }

// ---------- Navigation + barre d'onglets en verre ----------
const bar = $('#tabbar'), pill = $('#tabPill'), TABS = $$('.tab');
let cur = 's-home';

function go(id) {
  if (cur === id && id !== 's-table') return;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  cur = id;
  bar.classList.toggle('away', id === 's-table');
  document.body.classList.toggle('intable', id === 's-table');
  TABS.forEach(t => t.classList.toggle('on', t.dataset.go === id));
  placePill(TABS.findIndex(t => t.dataset.go === id));
  if (RENDER[id]) RENDER[id]();
}
function placePill(i, x) {
  if (i < 0) return pill.classList.remove('show');
  const t = TABS[i];
  pill.style.width = t.offsetWidth + 'px';
  const left = x == null ? t.offsetLeft : Math.max(6, Math.min(bar.clientWidth - t.offsetWidth - 6, x - t.offsetWidth / 2));
  pill.style.transform = `translateX(${left}px)`;
  pill.classList.add('show');
}
const tabAt = x => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(TABS.length - 1, Math.floor((x - r.left) / (r.width / TABS.length)))); };
let dragging = false;
bar.addEventListener('pointerdown', e => {
  dragging = true; bar.setPointerCapture(e.pointerId); bar.classList.add('press');
  const i = tabAt(e.clientX); TABS.forEach((t, k) => t.classList.toggle('over', k === i));
  placePill(i, e.clientX - bar.getBoundingClientRect().left);
});
bar.addEventListener('pointermove', e => {
  if (!dragging) return;
  bar.classList.add('drag');
  const i = tabAt(e.clientX); TABS.forEach((t, k) => t.classList.toggle('over', k === i));
  placePill(i, e.clientX - bar.getBoundingClientRect().left);
});
const release = e => {
  if (!dragging) return; dragging = false;
  bar.classList.remove('press', 'drag');
  TABS.forEach(t => t.classList.remove('over'));
  const i = tabAt(e.clientX); sfx.tap(); vib(8);
  if (TABS[i].dataset.go === cur) placePill(i); else { trial = null; go(TABS[i].dataset.go); }
};
bar.addEventListener('pointerup', release);
bar.addEventListener('pointercancel', () => { dragging = false; bar.classList.remove('press', 'drag'); placePill(TABS.findIndex(t => t.dataset.go === cur)); });
addEventListener('resize', () => placePill(TABS.findIndex(t => t.dataset.go === cur)));

// ---------- Accueil : modes en carrousel, tables, classement ----------
const STAKE_COLORS = ['var(--c-white)', 'var(--c-blue)', 'var(--c-lav)', 'var(--c-sand)', 'var(--c-coral)'];
const short = v => v >= 1000 ? (v / 1000).toLocaleString('fr-FR') + 'k' : String(v);
const ICONS = {
  solo: '<path fill="currentColor" d="M12 2c3 3.6 8 7 8 11.2A4.3 4.3 0 0 1 15.7 17.5c-1.2 0-2.2-.5-2.9-1.3.3 2 1 3.6 2.2 4.8H9c1.2-1.2 1.9-2.8 2.2-4.8-.7.8-1.7 1.3-2.9 1.3A4.3 4.3 0 0 1 4 13.2C4 9 9 5.6 12 2z"/>',
  quick: '<path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
  friends: '<path fill="currentColor" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-7 1.7-7 4.5V20h14v-2.5C16 14.7 12.3 13 9 13zm8-2a3.5 3.5 0 1 0-2.1-6.3 5.9 5.9 0 0 1 0 5.6A3.5 3.5 0 0 0 17 11zm1.2 2.1c1.6 1 2.8 2.5 2.8 4.4V20h3v-2.5c0-2.1-2.6-3.8-5.8-4.4z"/>',
  tour: '<path fill="currentColor" d="M7 3h10v2h3v3a5 5 0 0 1-4.3 4.95A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1a5 5 0 0 1-2.7-2.95A5 5 0 0 1 4 8V5h3V3zm0 4H6v1a3 3 0 0 0 1.4 2.53A5 5 0 0 1 7 9V7zm10 0v2c0 .53-.08 1.04-.24 1.53A3 3 0 0 0 18 8V7h-1z"/>',
  train: '<g fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/></g><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
};
const MODES = [
  { m: 'solo', name: 'Solo', sub: 'Toi contre le croupier', tint: 'var(--c-white)', info: () => STAKES[profile.stake].name + ' · mise ' + short(STAKES[profile.stake].min) + '–' + short(STAKES[profile.stake].max) },
  { m: 'quick', name: 'Partie rapide', sub: 'Un joueur au hasard', tint: 'var(--c-blue)', info: () => 'En ligne · table ' + STAKES[profile.stake].name },
  { m: 'friends', name: 'Avec des amis', sub: 'Ta table privée', tint: 'var(--c-lav)', info: () => "Jusqu'à 4 joueurs · code " + profile.code },
  { m: 'tour', name: 'Tournoi', sub: 'Entre amis, 15 mains', tint: 'var(--c-sand)', info: () => '5 000 jetons offerts · 1 000 au gagnant' },
  { m: 'train', name: 'Entraînement', sub: 'Jetons fictifs, coups corrigés', tint: 'var(--c-coral)', info: () => 'Tes vrais jetons ne bougent pas' },
];
const unlocked = lv => profile.bank >= lv.need || lv.id === 0;
function renderHome() {
  if (!unlocked(STAKES[profile.stake])) profile.stake = 0;
  const lv = level();
  $('#lvlLine').innerHTML = `Niveau ${lv.lvl} · ${fmt(stats.weekNet || 0) === '0' ? 'aucun gain cette semaine' : `${stats.weekNet > 0 ? '+' : ''}${fmt(stats.weekNet)} cette semaine`}`;
  const car = $('#modes');
  if (!car.children.length) {
    car.innerHTML = MODES.map(x => `<button class="mcard" data-mode="${x.m}" style="--tint:${x.tint}">
      <span class="mic"><svg viewBox="0 0 24 24">${ICONS[x.m]}</svg></span>
      <span class="mtx"><b>${x.name}</b><small>${x.sub}</small><em data-info="${x.m}"></em></span><span class="go">Jouer</span></button>`).join('');
    $('#modeDots').innerHTML = MODES.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('');
    car.addEventListener('scroll', () => {
      const i = Math.round(car.scrollLeft / (car.firstElementChild.offsetWidth + 12));
      $$('#modeDots i').forEach((d, k) => d.classList.toggle('on', k === i));
    }, { passive: true });
    $$('.mcard').forEach(b => b.onclick = () => playMode(b.dataset.mode));
  }
  MODES.forEach(x => { const e = $(`[data-info="${x.m}"]`); if (e) e.textContent = x.info(); });
  $('#stakes').innerHTML = STAKES.filter(l => !l.hidden).map(l => `<button class="spill${l.id === profile.stake ? ' sel' : ''}${unlocked(l) ? '' : ' lock'}" data-st="${l.id}">
    <i style="background:${STAKE_COLORS[l.id]}"></i><b>${l.name}</b><small>${unlocked(l) ? short(l.min) + '–' + short(l.max) : short(l.need) + ' requis'}</small></button>`).join('');
  $$('[data-st]').forEach(b => b.onclick = () => {
    const l = STAKES[+b.dataset.st];
    if (!unlocked(l)) { vib(30); return toast(`Il te faut ${fmt(l.need)} jetons pour la table ${l.name}`, { cls: 'bad' }); }
    profile.stake = l.id; save(); sfx.tap(); renderHome();
  });
  applyLook();
  renderBoard();
}

// Classement de la semaine (gains nets de la semaine, tous les joueurs)
let boardAt = 0;
async function renderBoard(force) {
  const el = $('#board');
  if (!force && Date.now() - boardAt < 20000 && el.children.length) return;
  boardAt = Date.now();
  try {
    const rows = await auth.fetchBoard();
    if (!rows.length) { el.innerHTML = '<div class="empty">Personne au classement cette semaine.<br>Gagne une main pour y entrer.</div>'; return; }
    el.innerHTML = rows.map((r, i) => `<div class="brow${r.me ? ' me' : ''}"><span class="rk r${i + 1}">${i + 1}</span>${avHTML(cleanPub(r.pub), r.name)}
      <span class="who">${nameHTML(r.name, r.pub)}<small>${esc((r.pub && r.pub.title) || 'Niveau ' + ((r.pub && r.pub.lvl) || 1))}</small></span>
      <b class="sc">${r.score > 0 ? '+' : ''}${fmt(r.score || 0)}</b></div>`).join('');
  } catch (e) { el.innerHTML = '<div class="empty">Classement indisponible pour le moment.</div>'; }
}
function pushMyBoard() { auth.pushBoard({ name: profile.name, pub: myPub(), score: stats.weekNet || 0 }); }
table.setOnSettle(() => pushMyBoard());
$('[data-go-profile]').onclick = () => go('s-profile');

function openTable() { closeSheet(); go('s-table'); }
table.setExit(() => { go('s-home'); stopQuick(); });

function playMode(m) {
  sfx.tap();
  if (m === 'solo' || m === 'train') { table.startLocal(m); openTable(); }
  else if (m !== 'tour' && profile.bank < STAKES[profile.stake].min) toast('Pas assez de jetons pour cette table', { cls: 'bad' });
  else if (!net.online()) toast('Connexion au réseau impossible pour le moment', { cls: 'bad' });
  else if (m === 'quick') quick();
  else if (m === 'tour') tourSheet();
  else friendsSheet();
}

let stopQuick = () => {};
function quick() {
  let hostingNow = false;
  stopQuick = net.quickMatch({
    stake: profile.stake,
    onWaiting: () => {
      hostingNow = true;
      table.startHost('Rapide', { onJoin: () => { table.setWaiting(false); stopQuick(); }, onLeave: () => stopQuick() });
      table.setWaiting(true); openTable();
    },
    onFound: async code => { if (!hostingNow && await table.startGuest(code, 'Rapide')) openTable(); },
    onError: () => toast('Partie rapide indisponible', { cls: 'bad' }),
  });
  toast('<span class="dots">Recherche d\'une partie</span>', { ms: 2500 });
}

function friendsSheet(prefill = '') {
  const el = sheet(`<h2>Avec des amis</h2><p>Ouvre ta table ${STAKES[profile.stake].name} : tes amis la rejoignent avec ton code. Jusqu'à 4 joueurs.</p>
    <button class="btn white full" id="hostBtn">Table avec mes jetons</button>
    <button class="btn full" id="hostFun">Table pour le fun · jetons fictifs</button>
    <div class="sep">ou</div>
    <form class="addf" id="joinForm"><input id="joinCode" maxlength="6" placeholder="Code de la table" value="${esc(prefill)}"><button class="btn">Rejoindre</button></form>
    ${friends.length ? '<div class="sep">inviter un ami</div><div class="list" id="invList"></div>' : ''}`);
  el.querySelector('#hostBtn').onclick = () => hostRoom();
  el.querySelector('#hostFun').onclick = () => hostRoom(true);
  el.querySelector('#joinForm').onsubmit = async e => { e.preventDefault(); const c = clean($('#joinCode').value); if (c.length === 6) join(c); };
  if (friends.length) {
    $('#invList').innerHTML = friends.map(f => `<div class="item">${avHTML(f.pub, f.name)}<div class="who"><b>${esc(f.name)}</b><small>${f.code}</small></div><button class="btn sm white" data-inv="${f.code}">Inviter</button></div>`).join('');
    $$('[data-inv]').forEach(b => b.onclick = () => invite(b.dataset.inv));
  }
}
function tourSheet() {
  const el = sheet(`<h2>Tournoi entre amis</h2><p>Chacun reçoit 5 000 jetons de tournoi pour 15 mains. Le meilleur solde final gagne <b>1 000</b> vrais jetons. Tes jetons à toi ne sont pas utilisés.</p>
    <button class="btn white full" id="tourHost">Créer le tournoi · ${profile.code}</button>
    <div class="sep">ou</div>
    <form class="addf" id="tourJoin"><input id="tourCode" maxlength="6" placeholder="Code du tournoi"><button class="btn">Rejoindre</button></form>`);
  el.querySelector('#tourHost').onclick = () => { if (table.isPlaying()) table.exit(true); table.startHost('Tournoi', { tour: true }); openTable(); toast(`Code du tournoi : <b>${profile.code}</b>`, { ms: 5000 }); };
  el.querySelector('#tourJoin').onsubmit = e => { e.preventDefault(); const c = clean($('#tourCode').value); if (c.length === 6) join(c); };
}
function hostRoom(fun) { if (table.isPlaying()) table.exit(true); table.startHost(fun ? 'Fun' : 'Amis', { fun }); openTable(); toast(`Ton code de table : <b>${profile.code}</b>`, { ms: 5000 }); }
async function join(code) {
  if (code === profile.code) return toast("C'est ton propre code", { cls: 'bad' });
  if (table.isPlaying()) table.exit(true);
  if (await table.startGuest(code, 'Amis')) openTable();
}
async function invite(code) {
  if (!net.online()) return toast('Hors ligne', { cls: 'bad' });
  try {
    await net.notify(code, { kind: 'invite', from: { code: profile.code, name: profile.name } });
    if (!table.hosting()) { if (table.isPlaying()) table.exit(true); hostRoom(); }
    toast('Invitation envoyée');
  } catch (e) { toast('Cet ami est hors ligne', { cls: 'bad' }); }
}
const clean = s => String(s).toUpperCase().split('').filter(c => ALPHA.includes(c)).join('').slice(0, 6);

// ---------- Boutique : 3 onglets, on essaie avant d'acheter ----------
let shopTab = 'avatar', shopCat = 'hair', trial = null; // trial = objet essayé (pas encore équipé)
const lookWith = it => it && (AVATAR_CATS.includes(it.cat) || it.cat === 'skin') ? { ...profile.look, [it.cat]: it.id } : profile.look;
const pubWith = it => ({ look: lookWith(it), frame: it && it.cat === 'frame' ? it.id : profile.cos.frame });
function previewOf(it, big) {
  if (it.cat === 'back') return `<span class="pvback ${it.id}${big ? ' big' : ''}"></span>`;
  if (it.cat === 'felt') return `<span class="pvfelt${big ? ' big' : ''}" data-felt="${it.id}"><span class="pvback ${profile.back}"></span></span>`;
  return avHTML(pubWith(it), profile.name, big ? 'xl' : '');
}
function stateOf(it) {
  if (equipped(it)) return { label: 'Équipé', cls: 'eqd' };
  if (owns(it)) return { label: 'À toi', cls: 'own' };
  if (it.req) { const [id, t] = reqOf(it), a = ACH.find(x => x.id === id); return { label: `${a ? a.name : 'Succès'} · ${TIERS[t - 1]}`, cls: 'req' }; }
  return { label: `<i class="coin"></i>${fmt(it.price)}`, cls: '' };
}
function renderShop() {
  const tab = SHOP_TABS.find(t => t.id === shopTab) || SHOP_TABS[0];
  if (!tab.groups.some(g => g.cat === shopCat)) shopCat = tab.groups[0].cat;
  const g = tab.groups.find(x => x.cat === shopCat);
  const cur = trial && trial.cat === g.cat ? trial : g.items.find(equipped) || g.items[0];
  const st = stateOf(cur);
  const action = equipped(cur) ? '<button class="btn full" disabled>Équipé</button>'
    : owns(cur) ? '<button class="btn white full" id="shopAct">Équiper</button>'
    : cur.req ? `<button class="btn full" disabled>Débloqué par le succès ${st.label}</button>`
    : `<button class="btn white full" id="shopAct"${profile.bank < cur.price ? ' disabled' : ''}>Acheter · ${fmt(cur.price)}</button>`;
  $('#shop').innerHTML = `<div class="seg">${SHOP_TABS.map(t => `<button class="${t.id === tab.id ? 'on' : ''}" data-tab="${t.id}">${t.title}</button>`).join('')}</div>
    <div class="tryon"><div class="trypv">${previewOf(cur, true)}</div><b>${esc(cur.name)}</b><small>${trial && !equipped(trial) ? 'Essai · ' : ''}${st.label}</small>${action}</div>
    ${tab.groups.length > 1 ? `<div class="chipsbar">${tab.groups.map(x => `<button class="cchip${x.cat === g.cat ? ' on' : ''}" data-cat="${x.cat}">${x.title}</button>`).join('')}</div>` : ''}
    <div class="shopgrid">${g.items.map(it => { const s = stateOf(it); return `<button class="sitem${it === cur ? ' sel' : ''}${equipped(it) ? ' eq' : ''}" data-it="${it.id}">${previewOf(it)}<b>${esc(it.name)}</b><span class="price ${s.cls}">${s.label}</span></button>`; }).join('')}</div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { shopTab = b.dataset.tab; trial = null; sfx.tap(); renderShop(); });
  $$('[data-cat]').forEach(b => b.onclick = () => { shopCat = b.dataset.cat; trial = null; sfx.tap(); renderShop(); });
  $$('[data-it]').forEach(b => b.onclick = () => { trial = g.items.find(i => String(i.id) === b.dataset.it); sfx.tap(); renderShop(); });
  const act = $('#shopAct'); if (act) act.onclick = () => { if (buy(cur)) { trial = null; renderShop(); } };
}
// Achète si besoin puis équipe ; renvoie true si quelque chose a changé
function buy(it) {
  if (!owns(it)) {
    if (it.req) { toast('Débloque ce succès pour l\'obtenir', { cls: 'bad' }); vib(30); return false; }
    if (profile.bank < it.price) { toast('Pas assez de jetons', { cls: 'bad' }); vib(40); return false; }
    profile.bank -= it.price; profile.owned.push(ownKey(it.cat, it.id)); sfx.win(); toast(`<b>${esc(it.name)}</b> est à toi`);
  } else sfx.tap();
  equip(it); applyLook(); save(); pushMyBoard();
  return true;
}

// ---------- Amis ----------
async function renderFriends() {
  $('[data-code]').textContent = profile.code;
  const list = $('#friendList');
  if (!friends.length) { list.innerHTML = '<div class="empty">Aucun ami pour l\'instant.<br>Partage ton code pour jouer ensemble.</div>'; return; }
  list.innerHTML = '<div class="list">' + friends.map(f => `<div class="item" data-f="${f.code}">
    <div class="avw">${avHTML(f.pub, f.name)}<i class="st"></i></div>
    <div class="who"><b>${esc(f.name)}</b><small class="fs">${f.code} · …</small></div>
    <button class="btn sm white" data-inv="${f.code}">Inviter</button>
    <button class="btn sm" data-del="${f.code}" aria-label="Retirer"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button></div>`).join('') + '</div>';
  $$('#friendList [data-inv]').forEach(b => b.onclick = () => invite(b.dataset.inv));
  $$('#friendList [data-del]').forEach(b => b.onclick = () => { const i = friends.findIndex(f => f.code === b.dataset.del); if (i >= 0) friends.splice(i, 1); save(); renderFriends(); });
  if (!net.online()) return;
  for (const f of friends) net.ping(f.code).then(r => {
    const row = $(`[data-f="${f.code}"]`); if (!row) return;
    row.querySelector('.st').classList.toggle('on', !!r);
    row.querySelector('.fs').textContent = f.code + ' · ' + (r ? (r.hosting ? 'à une table' : 'en ligne') : 'hors ligne');
    if (r && r.name) { f.name = String(r.name).slice(0, 16); f.pub = cleanPub(r.pub); save(true); row.querySelector('b').textContent = f.name; paintAv(row.querySelector('.av'), f.pub); }
  });
}
$('#copyCode').onclick = () => { try { navigator.clipboard.writeText(profile.code); toast('Code copié'); } catch (e) {} };
$('#addFriend').onsubmit = async e => {
  e.preventDefault();
  const code = clean($('#friendCode').value);
  if (code.length !== 6) return toast('Le code fait 6 caractères', { cls: 'bad' });
  if (code === profile.code) return toast("C'est ton propre code", { cls: 'bad' });
  if (friends.some(f => f.code === code)) return toast('Déjà dans tes amis');
  const r = await net.ping(code);
  friends.push({ code, name: (r && r.name) || 'Ami ' + code, pub: cleanPub(r && r.pub) });
  save(); checkAch(); $('#friendCode').value = ''; renderFriends();
  toast('Ami ajouté');
  net.notify(code, { kind: 'friend', from: { code: profile.code, name: profile.name } }).catch(() => {});
};

// Messages entrants
net.on('ping', c => { c.send({ name: profile.name, pub: myPub(), hosting: table.hosting() }); setTimeout(() => c.close(), 1000); });
net.on('friend', c => {
  const f = c.metadata.from || {}; c.close();
  if (!f.code || friends.some(x => x.code === f.code)) return;
  friends.push({ code: clean(f.code), name: String(f.name || 'Ami').slice(0, 16) }); save();
  toast(`<b>${esc(f.name)}</b> t'a ajouté en ami`); if (cur === 's-friends') renderFriends();
});
net.on('invite', c => {
  const f = c.metadata.from || {}; c.close(); vib([30, 60, 30]); sfx.win();
  toast(`<b>${esc(f.name)}</b> t'invite à sa table`, { action: 'Rejoindre', onAction: () => join(clean(f.code)) });
});

// ---------- Profil ----------
function renderProfile() {
  const acc = stats.dec ? Math.round(100 * stats.good / stats.dec) + '%' : '–';
  const wr = stats.hands ? Math.round(100 * stats.won / stats.hands) + '%' : '–', lv = level();
  $('#profile').innerHTML = `<div class="pcard">
      <button class="pav" id="editAv" aria-label="Changer de style">${avHTML(myPub(), profile.name, 'xl')}</button>
      <b class="pname">${esc(profile.name)}</b>
      <div class="lvl"><span>Niveau <b>${lv.lvl}</b></span><span class="bar"><i style="width:${Math.round(100 * lv.rest / lv.need)}%"></i></span><span>${fmt(lv.rest)}/${fmt(lv.need)}</span></div>
      <small class="pmail">Code ami ${profile.code}</small></div>
    <h2 class="h">Statistiques</h2>
    <div class="stats">
      <div class="stat"><b>${fmt(profile.bank)}</b><span>Jetons</span></div>
      <div class="stat"><b>${wr}</b><span>Mains gagnées</span></div>
      <div class="stat"><b>${fmt(stats.hands)}</b><span>Mains jouées</span></div>
      <div class="stat"><b>${acc}</b><span>Précision stratégie</span></div>
      <div class="stat"><b>${fmt(stats.bj)}</b><span>Blackjacks</span></div>
      <div class="stat"><b>${stats.bestStreak}</b><span>Meilleure série</span></div>
      <div class="stat"><b>${fmt(stats.best)}</b><span>Meilleur solde</span></div>
      <div class="stat"><b>${fmt(stats.tourWins || 0)}</b><span>Tournois gagnés</span></div>
    </div>${achHTML()}`;
  $('#editAv').onclick = () => myStyle();
}

// Mon style : uniquement ce que le joueur possède (l'essai et l'achat se font dans la Boutique)
let msCat = 'skin';
function myStyle() {
  const groups = ALL_GROUPS.map(g => ({ ...g, items: g.items.filter(owns) })).filter(g => g.items.length > 1 || g.cat === 'skin');
  const el = sheet('<div id="mystyle"></div>');
  const draw = () => {
    const g = groups.find(x => x.cat === msCat) || groups[0];
    el.querySelector('#mystyle').innerHTML = `<div class="avprev">${avHTML(myPub(), profile.name, 'xl')}</div>
      <div class="chipsbar">${groups.map(x => `<button class="cchip${x.cat === g.cat ? ' on' : ''}" data-mc="${x.cat}">${x.cat === 'felt' ? 'Fond' : x.cat === 'back' ? 'Cartes' : x.title}</button>`).join('')}</div>
      <div class="edgrid">${g.items.map(it => `<button class="eopt${equipped(it) ? ' eq' : ''}" data-mo="${it.id}">${previewOf(it)}<small>${esc(it.name)}</small></button>`).join('')}</div>
      <p class="hint">D'autres styles t'attendent dans la Boutique.</p>`;
    el.querySelectorAll('[data-mc]').forEach(b => b.onclick = () => { msCat = b.dataset.mc; draw(); });
    el.querySelectorAll('[data-mo]').forEach(b => b.onclick = () => {
      const it = g.items.find(i => String(i.id) === b.dataset.mo);
      equip(it); applyLook(); save(); pushMyBoard(); sfx.tap(); draw(); renderProfile();
    });
  };
  draw();
}

// ---------- Réglages ----------
function renderSettings() {
  const sw = (k, t, d) => `<div class="row"><div>${t}<small>${d}</small></div><button class="switch${settings[k] ? ' on' : ''}" data-k="${k}" aria-label="${t}"></button></div>`;
  $('#settings').innerHTML = `<div class="panel"><small class="cap">Pseudo</small><input class="field" id="nameIn" maxlength="16" value="${esc(profile.name)}"></div>
    <div class="panel">
      ${sw('sound', 'Sons', 'Cartes, jetons et gains')}
      ${sw('vibrate', 'Vibrations', 'Retour haptique sur mobile')}
      ${sw('trainer', 'Correction en partie', 'Indique tes erreurs de stratégie dans tous les modes')}
      ${sw('odds', 'Probabilités', 'Affiche tes chances de gagner pendant la main')}
      ${sw('hints', 'Afficher le bon coup', 'Surligne la meilleure action avant de jouer')}
    </div>
    <div class="panel"><div class="row"><div>Règles<small>6 jeux · le croupier reste sur 17 · blackjack payé 3:2 · double après séparation · jusqu'à 4 mains</small></div></div></div>
    <button class="btn full" id="logout">Se déconnecter</button>
    <p class="credit">Blackoff v2.4 · par YoskanGame</p>
    <button class="btn danger full" id="resetAll" style="margin-top:8px">Réinitialiser la progression</button>`;
  $('#logout').onclick = () => auth.logout();
  $$('.switch').forEach(b => b.onclick = () => { settings[b.dataset.k] = !settings[b.dataset.k]; b.classList.toggle('on'); save(); sfx.tap(); });
  $('#nameIn').onchange = e => { const v = e.target.value.trim().slice(0, 16); if (v) { profile.name = v; save(); applyLook(); pushMyBoard(); } };
  $('#resetAll').onclick = () => {
    const el = sheet(`<h2>Tout réinitialiser ?</h2><p>Jetons, achats, statistiques et amis seront effacés.</p><div class="grid"><button class="btn" id="no">Annuler</button><button class="btn white" id="yes">Réinitialiser</button></div>`);
    el.querySelector('#no').onclick = closeSheet; el.querySelector('#yes').onclick = resetAll;
  };
}

const RENDER = { 's-home': renderHome, 's-shop': renderShop, 's-friends': renderFriends, 's-profile': renderProfile, 's-settings': renderSettings };

// ---------- Divers ----------
$('#leave').onclick = () => {
  if (!table.atStake()) return table.exit();
  const el = sheet(`<h2>Quitter la table ?</h2><p>Une main en cours sera perdue.</p><div class="grid"><button class="btn" id="no">Rester</button><button class="btn white" id="yes">Quitter</button></div>`);
  el.querySelector('#no').onclick = closeSheet;
  el.querySelector('#yes').onclick = () => { closeSheet(); table.exit(); };
};
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

// ---------- Lancement : connexion Google obligatoire ----------
const gateMsg = $('#gateMsg'), loginBtn = $('#login');
loginBtn.onclick = async () => {
  loginBtn.disabled = true; gateMsg.textContent = 'Connexion…';
  try { await auth.signIn(); }
  catch (e) {
    const code = e.code || '';
    if (/popup-blocked|operation-not-supported/.test(code)) { try { return await auth.signInRedirect(); } catch (er) {} }
    loginBtn.disabled = false;
    gateMsg.innerHTML = /popup-closed|cancelled/.test(code) ? ''
      : code === 'auth/unauthorized-domain' ? `Ce site n'est pas autorisé dans Firebase.<br>Ajoute <b>${location.hostname}</b> dans Authentication › Settings › Authorized domains.`
      : code === 'auth/operation-not-allowed' ? 'La connexion Google est désactivée dans Firebase (Authentication › Sign-in method).'
      : `Connexion impossible (${esc(code || e.message)}). Réessaie.`;
  }
};
let booted = false;
function boot() {
  if (booted) return; booted = true;
  document.body.classList.remove('locked');
  applyLook(); save(true);
  TABS.forEach(t => t.classList.toggle('on', t.dataset.go === cur));
  renderHome(); requestAnimationFrame(() => placePill(2)); checkAch(); pushMyBoard();
  const status = $('#netStatus');
  net.init(profile.code)
    .then(() => { status.classList.add('on'); status.innerHTML = `<i></i>En ligne · code ${profile.code}`; })
    .catch(() => { status.innerHTML = '<i></i>Hors ligne · le solo reste disponible'; });
}
if (location.hostname === 'localhost' && location.hash === '#dev') boot(); // test local uniquement
else auth.start({
  onReady: boot,
  onLogin: () => { document.body.classList.add('locked'); $('#gate').classList.remove('boot'); loginBtn.disabled = false; gateMsg.textContent = 'Ta progression est sauvegardée sur ton compte.'; },
  onError: () => { $('#gate').classList.remove('boot'); gateMsg.innerHTML = 'Impossible de charger la connexion. <a href="" style="color:#fff">Réessayer</a>'; },
});
