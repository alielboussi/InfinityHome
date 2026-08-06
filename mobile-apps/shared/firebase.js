import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let authInstance = null;

function loadAsyncStorage() {
  try {
    const mod = require('@react-native-async-storage/async-storage');
    return mod?.default || mod;
  } catch {
    return null;
  }
}

function initAuth(app) {
  const AsyncStorage = loadAsyncStorage();
  if (AsyncStorage) {
    try {
      return initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch (error) {
      if (error?.code === 'auth/already-initialized') {
        return getAuth(app);
      }
      throw error;
    }
  }
  return getAuth(app);
}

export function getFirebaseApp() {
  if (!getApps().length) {
    const app = initializeApp(firebaseConfig);
    authInstance = initAuth(app);
  }
  return getApps()[0];
}

export function getDb() {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseAuth() {
  if (!authInstance) {
    getFirebaseApp();
  }
  return authInstance;
}

export async function getFirebaseIdToken(forceRefresh = false) {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export function subscribeFirebaseAuth(listener) {
  return onAuthStateChanged(getFirebaseAuth(), listener);
}

export async function signInFirebase(email, password) {
  return signInWithEmailAndPassword(getFirebaseAuth(), String(email || '').trim(), password);
}

export async function signOutFirebase() {
  return signOut(getFirebaseAuth());
}

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || 'https://infinity-home-pi.vercel.app').replace(/\/+$/, '');
