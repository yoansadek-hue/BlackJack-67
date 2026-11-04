// Application : navigation, barre d'onglets, accueil, boutique, amis, profil, réglages
import { $, $$, fmt, esc, toast, sheet, closeSheet, sfx, vib } from './util.js';
import { profile, stats, settings, friends, save, resetAll, ALPHA } from './store.js';
import * as net from './net.js';
import * as table from './table.js';

// ---------- Apparence ----------
function applyLook() { document.body.dataset.theme = profile.theme; document.body.dataset.back = profile.back; }

// ---------- Navigation + barre d'onglets en verre ----------
const bar = $('#tabbar'), pill = $('#tabPill'), TABS = $$('.tab');
let cur = 's-home';

function go(id) {
  if (cur === id && id !== 's-table') return;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  cur = id;
  bar.classList.toggle('away', id === 's-table');
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
  if (TABS[i].dataset.go === cur) placePill(i); else go(TABS[i].dataset.go);
};
bar.addEventListener('pointerup', release);
bar.addEventListener('pointercancel', () => { dragging = false; bar.classList.remove('press', 'drag'); placePill(TABS.findIndex(t => t.dataset.go === cur)); });
addEventListener('resize', () => placePill(TABS.findIndex(t => t.dataset.go === cur)));

// ---------- Accueil ----------
const DAY = 864e5, BONUS = 500;
function renderHome() {
  const ready = Date.now() - profile.lastBonus > DAY;
  $('#bonus').innerHTML = ready ? `<div class="bonus"><div><b>Bonus du jour</b><span>+${fmt(BONUS)} jetons gratuits</span></div><button class="btn sm primary" id="getBonus">Récupérer</button></div>` : '';
  if (ready) $('#getBonus').onclick = () => { profile.bank += BONUS; profile.lastBonus = Date.now(); save(); sfx.win(); toast(`<b>+${fmt(BONUS)}</b> jetons`); renderHome(); };
}

function openTable() { closeSheet(); go('s-table'); }
table.setExit(() => { go('s-home'); stopQuick(); });

$$('[data-mode]').forEach(b => b.onclick = () => {
  sfx.tap();
  const m = b.dataset.mode;
  if (m === 'solo' || m === 'train') { table.startLocal(m); openTable(); }
  else if (!net.online()) toast('Connexion au réseau impossible pour le moment', { cls: 'bad' });
  else if (m === 'quick') quick();
  else friendsSheet();
});

let stopQuick = () => {};
function quick() {
  let hostingNow = false;
  stopQuick = net.quickMatch({
    onWaiting: () => {
      hostingNow = true;
      table.startHost('Partie rapide', { onJoin: () => { table.setWaiting(false); stopQuick(); }, onLeave: () => stopQuick() });
      table.setWaiting(true); openTable();
    },
    onFound: async code => { if (!hostingNow && await table.startGuest(code, 'Partie rapide')) openTable(); },
    onError: () => toast('Partie rapide indisponible', { cls: 'bad' }),
  });
  toast('<span class="dots">Recherche d\'une partie</span>', { ms: 2500 });
}

function friendsSheet(prefill = '') {
  const el = sheet(`<h2>Jouer avec des amis</h2><p>Ouvre ta table : tes amis la rejoignent avec ton code. Jusqu'à 4 joueurs.</p>
    <button class="btn primary full" id="hostBtn">Créer ma table · ${profile.code}</button>
    <div class="sep">ou</div>
    <form class="addf" id="joinForm"><input id="joinCode" maxlength="6" placeholder="Code de la table" value="${esc(prefill)}"><button class="btn">Rejoindre</button></form>
    ${friends.length ? '<div class="sep">inviter un ami</div><div class="list" id="invList"></div>' : ''}`);
  el.querySelector('#hostBtn').onclick = () => hostRoom();
  el.querySelector('#joinForm').onsubmit = async e => { e.preventDefault(); const c = clean($('#joinCode').value); if (c.length === 6) join(c); };
  if (friends.length) {
    $('#invList').innerHTML = friends.map(f => `<div class="item"><div class="av">${esc(f.name[0] || '?')}</div><div class="who"><b>${esc(f.name)}</b><small>${f.code}</small></div><button class="btn sm primary" data-inv="${f.code}">Inviter</button></div>`).join('');
    $$('[data-inv]').forEach(b => b.onclick = () => invite(b.dataset.inv));
  }
}
function hostRoom() { if (!table.hosting()) table.startHost('Table de ' + profile.name); openTable(); toast(`Ton code de table : <b>${profile.code}</b>`, { ms: 5000 }); }
async function join(code) {
  if (code === profile.code) return toast("C'est ton propre code", { cls: 'bad' });
  if (table.isPlaying()) table.exit(true);
  if (await table.startGuest(code, 'Avec des amis')) openTable();
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

// ---------- Boutique ----------
const SHOP = {
  back: [['classic', 'Émeraude', 0], ['midnight', 'Minuit', 750], ['crimson', 'Carmin', 1500], ['carbon', 'Carbone', 2500], ['royal', 'Royal', 4000], ['gold', 'Or', 8000]],
  theme: [['emerald', 'Vert', 0, '#3ddc97'], ['ocean', 'Océan', 1000], ['ruby', 'Rubis', 2000], ['violet', 'Violet', 3500], ['gold', 'Doré', 7500]],
};
const THEME_COLORS = { emerald: '#3ddc97', ocean: '#4cc3ff', ruby: '#ff5c7a', violet: '#a68bff', gold: '#ffc857' };
function renderShop() {
  const cell = (kind, [id, name, price]) => {
    const key = kind + ':' + id, own = profile.owned.includes(key), eq = profile[kind] === id;
    const pv = kind === 'back' ? `<div class="pvback" style="${backStyle(id)}"></div>` : `<div class="pvtheme" style="border-color:${THEME_COLORS[id]};background:radial-gradient(${THEME_COLORS[id]}55,transparent 70%)"></div>`;
    return `<button class="sitem${eq ? ' eq' : ''}" data-buy="${key}" data-price="${price}">${pv}<b>${name}</b><span class="price${own ? ' own' : ''}">${eq ? 'Équipé' : own ? 'Possédé' : '● ' + fmt(price)}</span></button>`;
  };
  $('#shop').innerHTML = `<div class="shopcat">Dos de cartes</div><div class="shopgrid">${SHOP.back.map(i => cell('back', i)).join('')}</div>
    <div class="shopcat">Couleur de table</div><div class="shopgrid">${SHOP.theme.map(i => cell('theme', i)).join('')}</div>`;
  $$('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy, +b.dataset.price));
}
const BACKS = { classic: ['#1f6f53', '#0e3b2c'], midnight: ['#2a3f8f', '#111a3d'], crimson: ['#b3243a', '#4a0a16'], carbon: ['#3a3e46', '#0d0e11'], royal: ['#7b4dff', '#2a1366'], gold: ['#f5c451', '#8a5a00'] };
const backStyle = id => `background:linear-gradient(135deg,${BACKS[id][0]},${BACKS[id][1]})`;
function buy(key, price) {
  const [kind, id] = key.split(':');
  if (!profile.owned.includes(key)) {
    if (profile.bank < price) { toast('Pas assez de jetons', { cls: 'bad' }); vib(40); return; }
    profile.bank -= price; profile.owned.push(key); sfx.win(); toast('Achat effectué');
  } else sfx.tap();
  profile[kind] = id; applyLook(); save(); renderShop();
}

// ---------- Amis ----------
async function renderFriends() {
  $('[data-code]').textContent = profile.code;
  const list = $('#friendList');
  if (!friends.length) { list.innerHTML = '<div class="empty">Aucun ami pour l\'instant.<br>Partage ton code pour jouer ensemble.</div>'; return; }
  list.innerHTML = '<div class="list">' + friends.map(f => `<div class="item" data-f="${f.code}">
    <div class="av">${esc((f.name || '?')[0])}<i class="st"></i></div>
    <div class="who"><b>${esc(f.name)}</b><small class="fs">${f.code} · …</small></div>
    <button class="btn sm primary" data-inv="${f.code}">Inviter</button>
    <button class="btn sm" data-del="${f.code}" aria-label="Retirer">✕</button></div>`).join('') + '</div>';
  $$('#friendList [data-inv]').forEach(b => b.onclick = () => invite(b.dataset.inv));
  $$('#friendList [data-del]').forEach(b => b.onclick = () => { const i = friends.findIndex(f => f.code === b.dataset.del); if (i >= 0) friends.splice(i, 1); save(); renderFriends(); });
  if (!net.online()) return;
  for (const f of friends) net.ping(f.code).then(r => {
    const row = $(`[data-f="${f.code}"]`); if (!row) return;
    row.querySelector('.st').classList.toggle('on', !!r);
    row.querySelector('.fs').textContent = f.code + ' · ' + (r ? (r.hosting ? 'à une table' : 'en ligne') : 'hors ligne');
    if (r && r.name && r.name !== f.name) { f.name = r.name; save(); row.querySelector('b').textContent = r.name; }
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
  friends.push({ code, name: (r && r.name) || 'Ami ' + code });
  save(); $('#friendCode').value = ''; renderFriends();
  toast('Ami ajouté');
  net.notify(code, { kind: 'friend', from: { code: profile.code, name: profile.name } }).catch(() => {});
};

// Messages entrants
net.on('ping', c => { c.send({ name: profile.name, hosting: table.hosting() }); setTimeout(() => c.close(), 1000); });
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
  const wr = stats.hands ? Math.round(100 * stats.won / stats.hands) + '%' : '–';
  $('#profile').innerHTML = `<div class="phead"><div class="av big">${esc(profile.name[0] || '?')}</div><b>${esc(profile.name)}</b><small>Code ${profile.code}</small></div>
    <div class="stats">
      <div class="stat"><b>${fmt(profile.bank)}</b><span>Jetons</span></div>
      <div class="stat"><b>${fmt(stats.best)}</b><span>Meilleur solde</span></div>
      <div class="stat"><b>${fmt(stats.hands)}</b><span>Mains jouées</span></div>
      <div class="stat"><b>${wr}</b><span>Mains gagnées</span></div>
      <div class="stat"><b>${acc}</b><span>Précision stratégie</span></div>
      <div class="stat"><b>${fmt(stats.bj)}</b><span>Blackjacks</span></div>
      <div class="stat"><b>${stats.bestStreak}</b><span>Meilleure série</span></div>
      <div class="stat"><b>${fmt(stats.online)}</b><span>Mains en ligne</span></div>
    </div>`;
}

// ---------- Réglages ----------
function renderSettings() {
  const sw = (k, t, d) => `<div class="row"><div>${t}<small>${d}</small></div><button class="switch${settings[k] ? ' on' : ''}" data-k="${k}" aria-label="${t}"></button></div>`;
  $('#settings').innerHTML = `<div class="panel"><small class="cap">Pseudo</small><input class="field" id="nameIn" maxlength="16" value="${esc(profile.name)}"></div>
    <div class="panel">
      ${sw('sound', 'Sons', 'Cartes, jetons et gains')}
      ${sw('vibrate', 'Vibrations', 'Retour haptique sur mobile')}
      ${sw('trainer', 'Correction en partie', 'Indique tes erreurs de stratégie dans tous les modes')}
      ${sw('hints', 'Afficher le bon coup', 'Surligne la meilleure action avant de jouer')}
    </div>
    <div class="panel"><div class="row"><div>Règles<small>6 jeux · le croupier reste sur 17 · blackjack payé 3:2 · double après séparation · jusqu'à 4 mains</small></div></div></div>
    <button class="btn danger full" id="resetAll">Réinitialiser la progression</button>`;
  $$('.switch').forEach(b => b.onclick = () => { settings[b.dataset.k] = !settings[b.dataset.k]; b.classList.toggle('on'); save(); sfx.tap(); });
  $('#nameIn').onchange = e => { const v = e.target.value.trim().slice(0, 16); if (v) { profile.name = v; save(); } };
  $('#resetAll').onclick = () => {
    const el = sheet(`<h2>Tout réinitialiser ?</h2><p>Jetons, achats, statistiques et amis seront effacés.</p><div class="grid"><button class="btn" id="no">Annuler</button><button class="btn primary" id="yes">Réinitialiser</button></div>`);
    el.querySelector('#no').onclick = closeSheet; el.querySelector('#yes').onclick = resetAll;
  };
}

const RENDER = { 's-home': renderHome, 's-shop': renderShop, 's-friends': renderFriends, 's-profile': renderProfile, 's-settings': renderSettings };

// ---------- Divers ----------
$('#leave').onclick = () => {
  const el = sheet(`<h2>Quitter la table ?</h2><p>Une main en cours sera perdue.</p><div class="grid"><button class="btn" id="no">Rester</button><button class="btn primary" id="yes">Quitter</button></div>`);
  el.querySelector('#no').onclick = closeSheet;
  el.querySelector('#yes').onclick = () => { closeSheet(); table.exit(); };
};
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

// ---------- Lancement ----------
applyLook(); save();
TABS.forEach(t => t.classList.toggle('on', t.dataset.go === cur));
renderHome(); requestAnimationFrame(() => placePill(2));
const status = $('#netStatus');
net.init(profile.code)
  .then(() => { status.classList.add('on'); status.innerHTML = `<i></i>En ligne · ton code <b>&nbsp;${profile.code}</b>`; })
  .catch(() => { status.innerHTML = '<i></i>Hors ligne · le solo reste disponible'; });
