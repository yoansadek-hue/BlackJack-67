// Sauvegarde locale : profil, statistiques, réglages, amis
const K = 'blackoff_';
const get = (k, d) => { try { const v = localStorage.getItem(K + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const put = (k, v) => { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch (e) {} };

export const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const rid = n => Array.from({ length: n }, () => ALPHA[Math.random() * ALPHA.length | 0]).join('');

export const START_BANK = 1000;
export const profile = Object.assign({
  name: 'Joueur' + (Math.random() * 900 + 100 | 0),
  code: rid(6),
  bank: START_BANK,
  owned: ['back:stripes', 'av:a0'],
  back: 'stripes',
  look: { skin: 1, hair: 'court', hc: 'brun', eyes: 'points', mouth: 'sourire', acc: 'aucun', bg: 'ardoise' },
  cos: { frame: 'none', banner: 'plain', title: '', nc: 'blanc' },
  stake: 0,
}, get('profile', {}));
if (!profile.owned.includes('back:' + profile.back)) { profile.back = 'stripes'; }
if (!profile.owned.includes('back:stripes')) profile.owned.push('back:stripes');
if (!profile.look || typeof profile.look !== 'object') profile.look = { skin: 1, hair: 'court', hc: 'brun', eyes: 'points', mouth: 'sourire', acc: 'aucun', bg: 'ardoise' };
if (!profile.cos || typeof profile.cos !== 'object') profile.cos = { frame: 'none', banner: 'plain', title: '', nc: 'blanc' };
delete profile.avatar; // ancien format

export const stats = Object.assign({
  hands: 0, won: 0, lost: 0, push: 0, bj: 0, dec: 0, good: 0,
  best: START_BANK, streak: 0, bestStreak: 0, online: 0, tours: 0, tourWins: 0, ach2: {}, dblWon: 0, week: '', weekNet: 0,
}, get('stats', {}));

export const settings = Object.assign({ sound: true, vibrate: true, hints: false, trainer: false, odds: true }, get('settings', {}));

export const friends = get('friends', []); // [{ code, name }]

let saveHook = null;
export const onSave = fn => { saveHook = fn; };
export const KEYS = ['profile', 'stats', 'settings', 'friends'];
export const STORE_PREFIX = K;

export function save(quiet) {
  if (!quiet) profile.at = Date.now();
  stats.best = Math.max(stats.best, profile.bank);
  put('profile', profile); put('stats', stats); put('settings', settings); put('friends', friends);
  if (!quiet && saveHook) saveHook();
  document.querySelectorAll('[data-bank]').forEach(e => e.textContent = Math.round(profile.bank).toLocaleString('fr-FR'));
}

export function resetAll() {
  try { Object.keys(localStorage).filter(k => k.startsWith(K)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  location.reload();
}
