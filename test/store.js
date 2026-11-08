// Data access. The Firebase store syncs users/{uid}/{tasks|categories} through Firestore;
// the try-out store keeps the same shape in localStorage and never syncs.
// Deletions are kept as {deleted: true} so the PC app can learn about them.
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

export async function createStore(config) {
  if (!config || new URLSearchParams(location.search).has('demo')) return tryOutStore();
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
  const app = initializeApp(config);
  const a = auth.getAuth(app);
  a.languageCode = 'ja';
  const db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() });
  let stops = [];
  return {
    tryOut: false,
    onUser: cb => auth.onAuthStateChanged(a, u => cb(u && { uid: u.uid, email: u.email })),
    signIn: (email, password) => auth.signInWithEmailAndPassword(a, email, password),
    signUp: (email, password) => auth.createUserWithEmailAndPassword(a, email, password),
    resetPassword: email => auth.sendPasswordResetEmail(a, email),
    signOut() { stops.forEach(stop => stop()); stops = []; return auth.signOut(a); },
    watch(uid, onChange) {
      const state = { tasks: new Map(), categories: new Map(), meta: new Map(), pending: false };
      for (const name of ['tasks', 'categories', 'meta']) {
        stops.push(fs.onSnapshot(fs.collection(db, 'users', uid, name), { includeMetadataChanges: true }, snap => {
          for (const change of snap.docChanges()) {
            if (change.type === 'removed') state[name].delete(change.doc.id);
            else state[name].set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
          }
          state.pending = snap.metadata.hasPendingWrites;
          onChange(state);
        }, error => onChange(state, error)));
      }
    },
    // Not awaited by callers: offline writes resolve only once they reach the server.
    put: (uid, name, id, fields) =>
      fs.setDoc(fs.doc(db, 'users', uid, name, id), { ...fields, updatedAt: fs.serverTimestamp() }, { merge: true }),
  };
}

function tryOutStore() {
  const key = 'desktop-todo-tryout';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { }
  // Starts with example data so screens can be checked right away; 見本データに戻す in settings starts over.
  if (!saved.tasks) saved = sampleData();
  const state = {
    tasks: new Map(Object.entries(saved.tasks || {})),
    categories: new Map(Object.entries(saved.categories || {})),
    meta: new Map(Object.entries(saved.meta || {})),
    pending: false,
  };
  let listener = null, userListener = null;
  const user = { uid: 'try-out', email: 'お試しモード' };
  return {
    tryOut: true,
    onUser(cb) { userListener = cb; cb(user); },
    signIn: async () => { }, signUp: async () => { }, resetPassword: async () => { },
    async signOut() { userListener?.(user); },
    watch(uid, onChange) { listener = onChange; onChange(state); },
    async put(uid, name, id, fields) {
      state[name].set(id, { ...state[name].get(id), ...fields, id, updatedAt: new Date().toISOString() });
      try { localStorage.setItem(key, JSON.stringify({ tasks: Object.fromEntries(state.tasks), categories: Object.fromEntries(state.categories), meta: Object.fromEntries(state.meta) })); } catch { }
      listener?.(state);
    },
  };
}

// Example data for try-out mode (the test page and local checks).
function sampleData() {
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  const cats = { work: { name: '仕事', color: '#E07A5F', sortOrder: 0 }, home: { name: '家', color: '#7DB58F', sortOrder: 1 }, study: { name: '勉強', color: '#6FA8C9', sortOrder: 2 } };
  const list = [
    ['企画書の下書き', 'work', day(2), false, 5400],
    ['動画の編集', 'work', day(-1), false, 12600],
    ['リファレンス集め（来週の撮影用）', 'work', null, false, 0],
    ['牛乳を買う', 'home', day(0), false, 0],
    ['英単語 50個', 'study', day(6), false, 1500],
    ['病院の予約', 'home', null, true, 0],
  ];
  const tasks = {};
  list.forEach(([title, cat, dueDate, completed, seconds], i) => {
    const id = 'sample-' + i;
    tasks[id] = { id, title, categoryId: cat, dueDate, completed, completedAt: completed ? new Date().toISOString() : null, sortOrder: i,
      createdAt: new Date().toISOString(), timeLog: seconds ? [{ date: day(0), kind: '', seconds }] : [], deleted: false };
  });
  for (const [id, c] of Object.entries(cats)) cats[id] = { id, ...c, deleted: false };
  return { tasks, categories: cats, meta: { note: { id: 'note', body: '買い物：牛乳、卵\n来週の撮影は火曜の午後' } } };
}
