import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyD_CG1RINAIClJcdqGlyGXMp6unKXwknGE",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "melini-1810e.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "melini-1810e",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "melini-1810e.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "659288770691",
  appId: process.env.FIREBASE_APP_ID || "1:659288770691:web:cea6715917e65a7ab073b6",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-3RWMH7B5TF",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://melini-1810e-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Authenticate anonymously so the backend can read/write data securely
let authReady = signInAnonymously(auth).then(() => {
  console.log("Authenticated anonymously with Firebase RTDB successfully 🔌");
}).catch((error) => {
  console.error("Anonymous auth failed:", error);
});

// Returns a fresh Firebase ID token for the anonymous session (used for Storage REST API)
export async function getAuthToken() {
  await authReady;
  const user = auth.currentUser;
  if (!user) {
    // Re-auth if session expired
    await signInAnonymously(auth);
  }
  return auth.currentUser?.getIdToken(true);
}
