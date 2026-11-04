// Application : navigation, barre d'onglets, accueil, boutique, amis, profil, réglages
import { $, $$, fmt, esc, toast, sheet, closeSheet, sfx, vib } from './util.js';
import { profile, stats, settings, friends, save, resetAll, ALPHA } from './store.js';
import { STAKES } from './engine.js';
import * as net from './net.js';
import * as table from './table.js';
import * as auth from './auth.js';

// ---------- Apparence ----------
function applyLook() { document.body.dataset.back = profile.back; $$('[data-av]').forEach(e => e.textContent = profile.avatar); }

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

// ---------- Accueil : niveaux de table ----------
const STAKE_COLORS = ['#f5f5f7', '#64d2ff', '#bf5af2', '#ffd60a', '#ff453a'];
const unlocked = lv => profile.bank >= lv.need || lv.id === 0;
function renderHome() {
  if (!unlocked(STAKES[profile.stake])) profile.stake = 0;
  $('#stakes').innerHTML = STAKES.map(lv => `<button class="stake${lv.id === profile.stake ? ' sel' : ''}${unlocked(lv) ? '' : ' lock'}" data-st="${lv.id}">
    <i class="dotc" style="background:${STAKE_COLORS[lv.id]}"></i>
    <div><b>${lv.name}</b><br><small>Mise ${short(lv.min)} – ${short(lv.max)}</small></div>
    <div><span class="amt">${unlocked(lv) ? short(lv.min) : short(lv.need)}</span><br><small>${unlocked(lv) ? 'mise minimum' : 'jetons requis'}</small></div></button>`).join('');
  $$('[data-st]').forEach(b => b.onclick = () => {
    const lv = STAKES[+b.dataset.st];
    if (!unlocked(lv)) { vib(30); return toast(`Il te faut ${fmt(lv.need)} jetons pour la table ${lv.name}`, { cls: 'bad' }); }
    profile.stake = lv.id; save(); sfx.tap(); renderHome();
  });
  $$('[data-av]').forEach(e => e.textContent = profile.avatar);
}
const short = v => v >= 1000 ? (v / 1000).toLocaleString('fr-FR') + 'k' : String(v);
$('[data-go-profile]').onclick = () => go('s-profile');

function openTable() { closeSheet(); go('s-table'); }
table.setExit(() => { go('s-home'); stopQuick(); });

$$('[data-mode]').forEach(b => b.onclick = () => {
  sfx.tap();
  const m = b.dataset.mode;
  if (m === 'solo' || m === 'train') { table.startLocal(m); openTable(); }
  else if (profile.bank < STAKES[profile.stake].min) toast('Pas assez de jetons pour cette table', { cls: 'bad' });
  else if (!net.online()) toast('Connexion au réseau impossible pour le moment', { cls: 'bad' });
  else if (m === 'quick') quick();
  else friendsSheet();
});

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
    <button class="btn white full" id="hostBtn">Créer ma table · ${profile.code}</button>
    <div class="sep">ou</div>
    <form class="addf" id="joinForm"><input id="joinCode" maxlength="6" placeholder="Code de la table" value="${esc(prefill)}"><button class="btn">Rejoindre</button></form>
    ${friends.length ? '<div class="sep">inviter un ami</div><div class="list" id="invList"></div>' : ''}`);
  el.querySelector('#hostBtn').onclick = () => hostRoom();
  el.querySelector('#joinForm').onsubmit = async e => { e.preventDefault(); const c = clean($('#joinCode').value); if (c.length === 6) join(c); };
  if (friends.length) {
    $('#invList').innerHTML = friends.map(f => `<div class="item"><div class="av">${esc(f.avatar || '🙂')}</div><div class="who"><b>${esc(f.name)}</b><small>${f.code}</small></div><button class="btn sm white" data-inv="${f.code}">Inviter</button></div>`).join('');
    $$('[data-inv]').forEach(b => b.onclick = () => invite(b.dataset.inv));
  }
}
function hostRoom() { if (!table.hosting()) table.startHost('Amis'); openTable(); toast(`Ton code de table : <b>${profile.code}</b>`, { ms: 5000 }); }
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

// ---------- Boutique ----------
const SHOP = {
  av: [['🙂', 0], ['😎', 500], ['🤠', 800], ['🦊', 1200], ['🐼', 1500], ['🐯', 2000], ['🥷', 3000], ['🤖', 4000], ['👽', 6000], ['🦁', 9000], ['🐉', 15000], ['👑', 50000]],
  back: [['stripes', 'Rayures', 0], ['dots', 'Points', 600], ['grid', 'Grille', 1200], ['waves', 'Ondes', 2500], ['noir', 'Noir', 5000], ['rouge', 'Rouge', 10000], ['or', 'Or', 40000]],
};
function renderShop() {
  const price = (key, p, eq) => `<span class="price${profile.owned.includes(key) ? ' own' : ''}">${eq ? 'Équipé' : profile.owned.includes(key) ? 'Possédé' : `<i class="coin"></i>${fmt(p)}`}</span>`;
  $('#shop').innerHTML = `<h2 class="h">Avatars</h2><div class="shopgrid">${SHOP.av.map(([e, p]) => {
      const key = 'av:' + e, eq = profile.avatar === e;
      return `<button class="sitem${eq ? ' eq' : ''}" data-buy="${key}" data-price="${p}"><span class="av">${e}</span>${price(key, p, eq)}</button>`;
    }).join('')}</div>
    <h2 class="h">Dos de cartes</h2><div class="shopgrid">${SHOP.back.map(([id, name, p]) => {
      const key = 'back:' + id, eq = profile.back === id;
      return `<button class="sitem${eq ? ' eq' : ''}" data-buy="${key}" data-price="${p}"><span class="pvback ${id}"></span><b>${name}</b>${price(key, p, eq)}</button>`;
    }).join('')}</div>`;
  $$('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy, +b.dataset.price));
}
function buy(key, price) {
  const i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1);
  if (!profile.owned.includes(key)) {
    if (profile.bank < price) { toast('Pas assez de jetons', { cls: 'bad' }); vib(40); return; }
    profile.bank -= price; profile.owned.push(key); sfx.win(); toast('Débloqué');
  } else sfx.tap();
  if (kind === 'av') profile.avatar = id; else profile.back = id;
  applyLook(); save(); renderShop();
}

// ---------- Amis ----------
async function renderFriends() {
  $('[data-code]').textContent = profile.code;
  const list = $('#friendList');
  if (!friends.length) { list.innerHTML = '<div class="empty">Aucun ami pour l\'instant.<br>Partage ton code pour jouer ensemble.</div>'; return; }
  list.innerHTML = '<div class="list">' + friends.map(f => `<div class="item" data-f="${f.code}">
    <div class="av">${esc(f.avatar || '🙂')}<i class="st"></i></div>
    <div class="who"><b>${esc(f.name)}</b><small class="fs">${f.code} · …</small></div>
    <button class="btn sm white" data-inv="${f.code}">Inviter</button>
    <button class="btn sm" data-del="${f.code}" aria-label="Retirer">✕</button></div>`).join('') + '</div>';
  $$('#friendList [data-inv]').forEach(b => b.onclick = () => invite(b.dataset.inv));
  $$('#friendList [data-del]').forEach(b => b.onclick = () => { const i = friends.findIndex(f => f.code === b.dataset.del); if (i >= 0) friends.splice(i, 1); save(); renderFriends(); });
  if (!net.online()) return;
  for (const f of friends) net.ping(f.code).then(r => {
    const row = $(`[data-f="${f.code}"]`); if (!row) return;
    row.querySelector('.st').classList.toggle('on', !!r);
    row.querySelector('.fs').textContent = f.code + ' · ' + (r ? (r.hosting ? 'à une table' : 'en ligne') : 'hors ligne');
    if (r && r.name && (r.name !== f.name || r.avatar !== f.avatar)) { f.name = r.name; f.avatar = r.avatar; save(true); row.querySelector('b').textContent = r.name; row.querySelector('.av').firstChild.textContent = r.avatar || '🙂'; }
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
net.on('ping', c => { c.send({ name: profile.name, avatar: profile.avatar, hosting: table.hosting() }); setTimeout(() => c.close(), 1000); });
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
  $('#profile').innerHTML = `<div class="phead"><div class="av lg">${esc(profile.avatar)}</div><b>${esc(profile.name)}</b><small>${esc((auth.currentUser() || {}).email || '')} · code ${profile.code}</small></div>
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
      ${sw('odds', 'Probabilités', 'Affiche tes chances de gagner pendant la main')}
      ${sw('hints', 'Afficher le bon coup', 'Surligne la meilleure action avant de jouer')}
    </div>
    <div class="panel"><div class="row"><div>Règles<small>6 jeux · le croupier reste sur 17 · blackjack payé 3:2 · double après séparation · jusqu'à 4 mains</small></div></div></div>
    <button class="btn full" id="logout">Se déconnecter</button>
    <button class="btn danger full" id="resetAll" style="margin-top:8px">Réinitialiser la progression</button>`;
  $('#logout').onclick = () => auth.logout();
  $$('.switch').forEach(b => b.onclick = () => { settings[b.dataset.k] = !settings[b.dataset.k]; b.classList.toggle('on'); save(); sfx.tap(); });
  $('#nameIn').onchange = e => { const v = e.target.value.trim().slice(0, 16); if (v) { profile.name = v; save(); } };
  $('#resetAll').onclick = () => {
    const el = sheet(`<h2>Tout réinitialiser ?</h2><p>Jetons, achats, statistiques et amis seront effacés.</p><div class="grid"><button class="btn" id="no">Annuler</button><button class="btn white" id="yes">Réinitialiser</button></div>`);
    el.querySelector('#no').onclick = closeSheet; el.querySelector('#yes').onclick = resetAll;
  };
}

const RENDER = { 's-home': renderHome, 's-shop': renderShop, 's-friends': renderFriends, 's-profile': renderProfile, 's-settings': renderSettings };

// ---------- Divers ----------
$('#leave').onclick = () => {
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
  catch (e) { loginBtn.disabled = false; gateMsg.textContent = /popup-closed|cancelled/.test(e.code || '') ? '' : 'Connexion impossible. Réessaie.'; }
};
let booted = false;
function boot() {
  if (booted) return; booted = true;
  document.body.classList.remove('locked');
  applyLook(); save(true);
  TABS.forEach(t => t.classList.toggle('on', t.dataset.go === cur));
  renderHome(); requestAnimationFrame(() => placePill(2));
  const status = $('#netStatus');
  net.init(profile.code)
    .then(() => { status.classList.add('on'); status.innerHTML = `<i></i>En ligne · code ${profile.code}`; })
    .catch(() => { status.innerHTML = '<i></i>Hors ligne · le solo reste disponible'; });
}
if (location.hostname === 'localhost' && location.hash === '#dev') boot(); // test local uniquement
else auth.start({
  onReady: boot,
  onLogin: () => { document.body.classList.add('locked'); loginBtn.disabled = false; gateMsg.textContent = 'Ta progression est sauvegardée sur ton compte.'; },
  onError: () => { gateMsg.innerHTML = 'Impossible de charger la connexion. <a href="" style="color:#fff">Réessayer</a>'; },
});
