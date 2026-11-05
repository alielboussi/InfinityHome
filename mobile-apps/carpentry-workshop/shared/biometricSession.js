/** In-flight unlock shared across remounts (e.g. React Strict Mode). */
let unlockInFlight = null;
/** Successful unlock for the current signed-in session (cleared on sign-out). */
let sessionUnlocked = false;

export function isBiometricSessionUnlocked() {
  return sessionUnlocked;
}

export function setBiometricSessionUnlocked(value) {
  sessionUnlocked = value;
}

export function getBiometricUnlockInFlight() {
  return unlockInFlight;
}

export function setBiometricUnlockInFlight(promise) {
  unlockInFlight = promise;
}

export function resetBiometricUnlock() {
  sessionUnlocked = false;
  unlockInFlight = null;
}
