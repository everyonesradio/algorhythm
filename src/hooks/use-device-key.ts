// ** React/Next.js Imports
import { useSyncExternalStore } from "react";

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

export const useDeviceKey = () =>
  useSyncExternalStore(subscribe, getDeviceKey, () => null);
