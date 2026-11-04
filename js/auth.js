// Connexion Google obligatoire (Firebase) + sauvegarde de la progression dans le cloud
import { firebaseConfig } from './config.js';
import { profile, stats, settings, friends, save, onSave, KEYS, STORE_PREFIX } from './store.js';

const BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
const COLLECTION = 'blackoff_users';
let fb = null, user = null, timer = null;

export const currentUser = () => user;

async function load() {
  if (fb) return fb;
  const [app, auth, fs] = await Promise.all(['firebase-app', 'firebase-auth', 'firebase-firestore'].map(m => import(BASE + m + '.js')));
  const a = app.initializeApp(firebaseConfig, 'blackoff');
  fb = { ...auth, ...fs, auth: auth.getAuth(a), db: fs.getFirestore(a) };
  return fb;
}

// onReady(user) : connecté et données prêtes · onLogin() : il faut se connecter · onError(e)
export async function start({ onReady, onLogin, onError }) {
  try {
    const f = await load();
    let started = false;
    f.onAuthStateChanged(f.auth, async u => {
      user = u;
      if (!u) { started = false; return onLogin(); }
      if (started) return;
      if (await sync(u)) { started = true; onReady(u); }
    });
  } catch (e) { onError(e); }
}

export async function signIn() {
  const f = await load();
  return f.signInWithPopup(f.auth, new f.GoogleAuthProvider());
}
export async function signInRedirect() {
  const f = await load();
  return f.signInWithRedirect(f.auth, new f.GoogleAuthProvider());
}
export async function logout() { if (fb) await fb.signOut(fb.auth); location.reload(); }

const ref = () => fb.doc(fb.db, COLLECTION, user.uid);

// ---------- Classement de la semaine ----------
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + '-S' + String(w).padStart(2, '0');
}
let boardTimer = null;
export function pushBoard(entry) {
  if (!user || !fb) return;
  clearTimeout(boardTimer);
  boardTimer = setTimeout(async () => {
    try { await fb.setDoc(fb.doc(fb.db, 'blackoff_board', weekKey(), 'players', user.uid), JSON.parse(JSON.stringify({ ...entry, at: Date.now() }))); }
    catch (e) { console.warn('Classement :', e.message); }
  }, 2000);
}
export async function fetchBoard() {
  if (!user || !fb) throw new Error('offline');
  const q = fb.query(fb.collection(fb.db, 'blackoff_board', weekKey(), 'players'), fb.orderBy('score', 'desc'), fb.limit(20));
  const snap = await fb.getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, me: d.id === user.uid, ...d.data() }));
}
const writeLocal = obj => KEYS.forEach(k => { try { obj[k] == null ? localStorage.removeItem(STORE_PREFIX + k) : localStorage.setItem(STORE_PREFIX + k, JSON.stringify(obj[k])); } catch (e) {} });

// Récupère la sauvegarde du compte. Renvoie false si la page va se recharger.
async function sync(u) {
  let cloud = null;
  try { const snap = await fb.getDoc(ref()); cloud = snap.exists() ? snap.data() : null; }
  catch (e) { console.warn('Sauvegarde cloud indisponible :', e.message); }
  const mine = profile.uid === u.uid;
  // Sécurité : jamais plus de 2 rechargements automatiques de suite
  let n = 0; try { n = +sessionStorage.getItem('blackoff_reloads') || 0; } catch (e) {}
  const reload = () => { try { sessionStorage.setItem('blackoff_reloads', n + 1); } catch (e) {} location.reload(); return false; };
  if (n < 2) {
    if (cloud && cloud.profile && (!mine || (cloud.profile.at || 0) > (profile.at || 0))) {
      cloud.profile.uid = u.uid; // la sauvegarde est rattachée à ce compte
      writeLocal(cloud); return reload(); // la sauvegarde du compte remplace celle de l'appareil
    }
    if (!cloud && profile.uid && !mine) { // autre compte sur cet appareil : on repart de zéro
      writeLocal({ profile: { uid: u.uid } }); return reload();
    }
  }
  try { sessionStorage.removeItem('blackoff_reloads'); } catch (e) {}
  if (cloud && cloud.profile && !mine) Object.assign(profile, cloud.profile); // secours si le rechargement n'a pas suffi
  profile.uid = u.uid;
  if (!profile.named) {
    profile.named = true;
    if (u.displayName && /^Joueur\d+$/.test(profile.name)) profile.name = u.displayName.split(' ')[0].slice(0, 16);
  }
  save(); push();
  return true;
}
async function push() {
  if (!user || !fb) return;
  try { await fb.setDoc(ref(), JSON.parse(JSON.stringify({ profile, stats, settings, friends }))); }
  catch (e) { console.warn('Sauvegarde cloud impossible :', e.message); }
}
onSave(() => { if (!user) return; clearTimeout(timer); timer = setTimeout(push, 1200); });
addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); push(); } });
