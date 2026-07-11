// Dynamic imports for Firebase to prevent script loading failure when offline or unconfigured
let signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged;
let doc, setDoc, getDoc, collection, writeBatch;
let getStorage, ref, uploadBytes, getDownloadURL;

let useFirebase = false;

async function initFirebase() {
    try {
        const authMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
        signInWithEmailAndPassword = authMod.signInWithEmailAndPassword;
        createUserWithEmailAndPassword = authMod.createUserWithEmailAndPassword;
        signOut = authMod.signOut;
        onAuthStateChanged = authMod.onAuthStateChanged;

        const dbMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        doc = dbMod.doc;
        setDoc = dbMod.setDoc;
        getDoc = dbMod.getDoc;
        collection = dbMod.collection;
        writeBatch = dbMod.writeBatch;

        const storageMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");
        getStorage = storageMod.getStorage;
        ref = storageMod.ref;
        uploadBytes = storageMod.uploadBytes;
        getDownloadURL = storageMod.getDownloadURL;

        useFirebase = true;
    } catch (e) {
        console.warn("Firebase CDN could not be loaded. Falling back to local backend API.", e);
        useFirebase = false;
    }
}

const firebaseInitPromise = initFirebase();

// Keep checking until window.firebaseAuth is available, since they are loaded as modules
function getFirebaseRefs() {
    return new Promise(resolve => {
        if (window.firebaseAuth && window.firebaseDb) {
            resolve({ auth: window.firebaseAuth, db: window.firebaseDb });
        } else {
            const interval = setInterval(() => {
                if (window.firebaseAuth && window.firebaseDb) {
                    clearInterval(interval);
                    resolve({ auth: window.firebaseAuth, db: window.firebaseDb });
                }
            }, 50);
        }
    });
}

// =====================================
// EXPORT FIREBASE STORAGE HELPER
// =====================================
window.fbUploadImage = async (file, path = 'uploads') => {
    await firebaseInitPromise;
    if (useFirebase && window.firebaseStorage && window.firebaseAuth) {
        try {
            const storage = window.firebaseStorage;
            const auth = window.firebaseAuth;
            if (!storage || !auth || !auth.currentUser) throw new Error("Firebase Storage/Auth not initialized");
            
            const filename = `${Date.now()}_${file.name}`;
            const storageRef = ref(storage, `${path}/${auth.currentUser.uid}/${filename}`);
            
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
        } catch (err) {
            console.error("Firebase Storage Upload Error:", err);
            throw err;
        }
    } else {
        // Fallback: convert file to a local Data URL
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
};

window.fbLogin = async function(email, password) {
    await firebaseInitPromise;
    if (useFirebase && window.firebaseAuth && window.firebaseDb) {
        const { auth, db } = await getFirebaseRefs();
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // Fetch username from Firestore
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const username = userDoc.exists() ? userDoc.data().username : "User";
            
            return { 
                token: user.accessToken, 
                user: { uid: user.uid, email: user.email, username: username } 
            };
        } catch (error) {
            throw new Error(error.message);
        }
    } else {
        try {
            const res = await fetch('http://localhost:3000/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to login');
            
            return {
                token: data.token,
                user: { 
                    uid: data.user.uid, 
                    email: data.user.email, 
                    username: data.user.username || data.user.email.split('@')[0] 
                }
            };
        } catch (error) {
            throw new Error(error.message || 'Local backend login failed');
        }
    }
};

window.fbRegister = async function(username, email, password) {
    await firebaseInitPromise;
    if (useFirebase && window.firebaseAuth && window.firebaseDb) {
        const { auth, db } = await getFirebaseRefs();
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // Save username to Firestore
            await setDoc(doc(db, "users", user.uid), {
                username: username,
                email: email,
                createdAt: new Date().toISOString()
            });
            
            return { 
                token: user.accessToken, 
                user: { uid: user.uid, email: user.email, username: username } 
            };
        } catch (error) {
            throw new Error(error.message);
        }
    } else {
        try {
            const res = await fetch('http://localhost:3000/api/users/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to register');
            
            return {
                token: data.token,
                user: { 
                    uid: data.user.uid, 
                    email: data.user.email, 
                    username: data.user.username || username 
                }
            };
        } catch (error) {
            throw new Error(error.message || 'Local backend registration failed');
        }
    }
};

window.fbLogout = async function() {
    await firebaseInitPromise;
    if (useFirebase && window.firebaseAuth) {
        const { auth } = await getFirebaseRefs();
        return signOut(auth);
    } else {
        return Promise.resolve();
    }
};

window.fbSyncNow = async function(changes, lastSyncTimestamp) {
    await firebaseInitPromise;
    if (useFirebase && window.firebaseAuth && window.firebaseDb) {
        const { auth, db } = await getFirebaseRefs();
        const user = auth.currentUser;
        if (!user) throw new Error("Not logged in");
        
        const batch = writeBatch(db);
        let hasChanges = false;
        
        const processUploadQueue = (entity, queue, type) => {
            queue.forEach(item => {
                hasChanges = true;
                let docRef;
                if (entity === "notes") {
                    docRef = doc(db, "users", user.uid, "notes", item.client_id || item.id || "note");
                } else if (entity === "events") {
                    docRef = doc(db, "users", user.uid, "events", item.client_id || item.id || "event");
                } else if (entity === "flashcards") {
                    docRef = doc(db, "users", user.uid, "flashcard_decks", item.client_id || item.id || "deck");
                }
                
                if (docRef) {
                    if (type === "deleted") {
                        docRef = doc(db, "users", user.uid, entity === "flashcards" ? "flashcard_decks" : entity, item);
                        batch.delete(docRef);
                    } else {
                        batch.set(docRef, item, { merge: true });
                    }
                }
            });
        };
        
        if (changes) {
            ["notes", "events", "flashcards"].forEach(entity => {
                if (changes[entity]) {
                    if (changes[entity].created) processUploadQueue(entity, changes[entity].created, "created");
                    if (changes[entity].updated) processUploadQueue(entity, changes[entity].updated, "updated");
                    if (changes[entity].deleted) processUploadQueue(entity, changes[entity].deleted, "deleted");
                }
            });
        }
        
        if (hasChanges) {
            await batch.commit();
        }
        
        let serverChanges = { notes: [], events: [], flashcards: [] };
        try {
            const notesDoc = await getDoc(doc(db, "users", user.uid, "notes", "cognify_active_note"));
            if (notesDoc.exists()) {
                 serverChanges.notes.push(notesDoc.data());
            }
        } catch(e) { console.error(e); }
        
        return {
            success: true,
            serverTime: new Date().toISOString(),
            changes: serverChanges,
            clearedChanges: {
                notes: { created: [], updated: [], deleted: [] },
                events: { created: [], updated: [], deleted: [] },
                flashcards: { created: [], updated: [], deleted: [] }
            }
        };
    } else {
        return {
            success: true,
            serverTime: new Date().toISOString(),
            changes: { notes: [], events: [], flashcards: [] },
            clearedChanges: {
                notes: { created: [], updated: [], deleted: [] },
                events: { created: [], updated: [], deleted: [] },
                flashcards: { created: [], updated: [], deleted: [] }
            }
        };
    }
};

