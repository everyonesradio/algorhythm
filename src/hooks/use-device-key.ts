// ** React/Next.js Imports
import { useSyncExternalStore } from "react";

/**
 * A random key for this browser, so a phone can undo its own library finds
 * without an account. Only a hash of it is stored on the server.
 *
 * Kept in localStorage; if storage is blocked (private mode), falls back to a
 * key for this page session.
 */
const STORAGE_KEY = "algorhythm:device-key";
let memoryKey: string | null = null;

const newKey = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export const getDeviceKey = () => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && /^[\w-]{20,100}$/.test(saved)) return saved;
    const key = newKey();
    window.localStorage.setItem(STORAGE_KEY, key);
    return key;
  } catch {
    memoryKey ??= newKey();
    return memoryKey;
  }
};

const subscribe = () => () => undefined;

/** The device key on the client; null during server rendering. */
export const useDeviceKey = () =>
  useSyncExternalStore(subscribe, getDeviceKey, () => null);
