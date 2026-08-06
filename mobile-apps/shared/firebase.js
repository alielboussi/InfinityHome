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
import {
  DEFAULT_API_BASE,
  DEFAULT_FIREBASE_CONFIG,
} from './defaultFirebaseConfig';
import { readExpoExtra } from './expoExtra';

function pickConfigValue(envValue, extraValue, fallbackValue) {
  const env = String(envValue || '').trim();
  if (env) return env;
  const extra = String(extraValue || '').trim();
  if (extra) return extra;
  return String(fallbackValue || '').trim();
}

function resolveFirebaseConfig() {
  const extra = readExpoExtra();
  const fromExtra = extra.firebase || {};
  return {
    apiKey: pickConfigValue(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, fromExtra.apiKey, DEFAULT_FIREBASE_CONFIG.apiKey),
    authDomain: pickConfigValue(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, fromExtra.authDomain, DEFAULT_FIREBASE_CONFIG.authDomain),
    projectId: pickConfigValue(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, fromExtra.projectId, DEFAULT_FIREBASE_CONFIG.projectId),
    storageBucket: pickConfigValue(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, fromExtra.storageBucket, DEFAULT_FIREBASE_CONFIG.storageBucket),
    messagingSenderId: pickConfigValue(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, fromExtra.messagingSenderId, DEFAULT_FIREBASE_CONFIG.messagingSenderId),
    appId: pickConfigValue(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, fromExtra.appId, DEFAULT_FIREBASE_CONFIG.appId),
  };
}

const firebaseConfig = resolveFirebaseConfig();

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

export const API_BASE = (() => {
  const extra = readExpoExtra();
  return pickConfigValue(
    process.env.EXPO_PUBLIC_API_BASE,
    extra.apiBase,
    DEFAULT_API_BASE,
  ).replace(/\/+$/, '');
})();
