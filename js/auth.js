// Connexion Google (Firebase) + sauvegarde de la progression dans le cloud
import { firebaseConfig } from './config.js';
import { profile, stats, settings, friends, save, onSave, KEYS, STORE_PREFIX } from './store.js';

const V = '10.12.2', BASE = `https://www.gstatic.com/firebasejs/${V}/`;
const COLLECTION = 'blackoff_users';
let fb = null, user = null, timer = null, listeners = [];

export const currentUser = () => user;
export const onUser = fn => { listeners.push(fn); fn(user); };
const tell = () => listeners.forEach(f => f(user));

async function load() {
  if (fb) return fb;
  if (!firebaseConfig || !firebaseConfig.apiKey) throw new Error('config');
  const [app, auth, fs] = await Promise.all(['firebase-app', 'firebase-auth', 'firebase-firestore'].map(m => import(BASE + m + '.js')));
  const a = app.initializeApp(firebaseConfig, 'blackoff');
  fb = { ...auth, ...fs, auth: auth.getAuth(a), db: fs.getFirestore(a) };
  return fb;
}

export async function init() {
  try {
    const f = await load();
    f.onAuthStateChanged(f.auth, async u => { user = u; tell(); if (u) await sync(); });
  } catch (e) { console.warn('Connexion Google indisponible :', e.message); }
}

export async function signIn() {
  const f = await load();
  return f.signInWithPopup(f.auth, new f.GoogleAuthProvider());
}
export async function logout() { if (fb) await fb.signOut(fb.auth); }

const data = () => ({ profile, stats, settings, friends });
const ref = () => fb.doc(fb.db, COLLECTION, user.uid);

// À la connexion : la version la plus récente (appareil ou cloud) gagne
async function sync() {
  try {
    const snap = await fb.getDoc(ref());
    const cloud = snap.exists() ? snap.data() : null;
    if (cloud && cloud.profile && (cloud.profile.at || 0) > (profile.at || 0)) {
      KEYS.forEach(k => { if (cloud[k] != null) localStorage.setItem(STORE_PREFIX + k, JSON.stringify(cloud[k])); });
      return location.reload(); // recharge avec la sauvegarde du cloud (code ami compris)
    }
    if (!cloud && user.displayName && /^Joueur\d+$/.test(profile.name)) profile.name = user.displayName.split(' ')[0].slice(0, 16);
    save(); await push();
  } catch (e) { console.warn('Sauvegarde cloud impossible :', e.message); }
}
async function push() {
  if (!user || !fb) return;
  try { await fb.setDoc(ref(), JSON.parse(JSON.stringify(data()))); } catch (e) { console.warn('Sauvegarde cloud impossible :', e.message); }
}
onSave(() => { if (!user) return; clearTimeout(timer); timer = setTimeout(push, 1500); });
