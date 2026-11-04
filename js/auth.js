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
export async function logout() { if (fb) await fb.signOut(fb.auth); location.reload(); }

const ref = () => fb.doc(fb.db, COLLECTION, user.uid);
const writeLocal = obj => KEYS.forEach(k => { try { obj[k] == null ? localStorage.removeItem(STORE_PREFIX + k) : localStorage.setItem(STORE_PREFIX + k, JSON.stringify(obj[k])); } catch (e) {} });

// Récupère la sauvegarde du compte. Renvoie false si la page va se recharger.
async function sync(u) {
  let cloud = null;
  try { const snap = await fb.getDoc(ref()); cloud = snap.exists() ? snap.data() : null; }
  catch (e) { console.warn('Sauvegarde cloud indisponible :', e.message); }
  const mine = profile.uid === u.uid;
  if (cloud && cloud.profile && (!mine || (cloud.profile.at || 0) > (profile.at || 0))) {
    writeLocal(cloud); location.reload(); return false; // la sauvegarde du compte remplace celle de l'appareil
  }
  if (!cloud && profile.uid && !mine) { // autre compte sur cet appareil : on repart de zéro
    writeLocal({ profile: { uid: u.uid } }); location.reload(); return false;
  }
  if (!profile.uid) {
    profile.uid = u.uid;
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
