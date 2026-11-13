// ** React/Next.js Imports
import { useSyncExternalStore } from "react";

/**
 * The pop-up this phone joined (from the QR at the venue). Finds added while
 * it's set are credited to the event. Forgotten an hour after the event ends,
 * matching the server's window.
 */
export type JoinedEvent = {
  slug: string;
  name: string;
  code: string;
  endsAt: string;
};

const KEY = "algorhythm:event";
const GRACE_MS = 60 * 60 * 1000;
const CHANGED = "algorhythm:event-changed";

let cache: { raw: string | null; value: JoinedEvent | null } = {
  raw: null,
  value: null,
};

const read = (): JoinedEvent | null => {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cache.raw) return cache.value;
  let value: JoinedEvent | null = null;
  try {
    const parsed = raw ? (JSON.parse(raw) as JoinedEvent) : null;
    if (parsed && Date.parse(parsed.endsAt) + GRACE_MS > Date.now())
      value = parsed;
  } catch {
    value = null;
  }
  cache = { raw, value };
  return value;
};

const write = (value: JoinedEvent | null) => {
  try {
    if (value) window.localStorage.setItem(KEY, JSON.stringify(value));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the pop-up just isn't remembered.
  }
  window.dispatchEvent(new Event(CHANGED));
};

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
};

export const joinEvent = (event: JoinedEvent) => write(event);
export const leaveEvent = () => write(null);

/** The joined pop-up, or null (always null while server rendering). */
export const useJoinedEvent = () =>
  useSyncExternalStore(subscribe, read, () => null);
