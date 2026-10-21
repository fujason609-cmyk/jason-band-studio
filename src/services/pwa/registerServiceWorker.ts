import { SAMPLE_PACKS, samplePackUrl } from "@/audio/audioConfig";
import { TOUCH_QUERY } from "@/hooks/useMediaQuery";
import type { InstrumentId } from "@/types/audio";

/** How many sample files download at once while warming the cache. */
const PARALLEL = 4;

/** Every recorded sample the band can play, as URLs. */
export function sampleUrls(): string[] {
  return (Object.entries(SAMPLE_PACKS) as [InstrumentId, NonNullable<(typeof SAMPLE_PACKS)[InstrumentId]>][]).flatMap(
    ([instrument, pack]) =>
      [...Object.values(pack.files), ...Object.values(pack.soft?.files ?? {})].map((file) => samplePackUrl(instrument, file)),
  );
}

export interface ConnectionInfo {
  saveData?: boolean;
  type?: string;
  effectiveType?: string;
}

/**
 * Whether to download every sample (about 4.6 MB) before it's needed, so the whole band
 * works offline. When the browser says the connection is not metered or slow; when it says
 * nothing (Safari, Firefox), only on a computer (`touch` false): a phone may be on mobile
 * data, so it fetches each instrument on its first Play instead (cached then too).
 */
export function shouldWarmSamples(connection: ConnectionInfo | undefined, touch: boolean): boolean {
  if (!connection) return !touch;
  if (connection.saveData) return false;
  if (connection.type === "cellular") return false;
  return !connection.effectiveType || connection.effectiveType === "4g";
}

/** Resolves once a service worker controls this page (not on a hard reload, which bypasses it). */
function controlled(): Promise<void> {
  if (navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
}

/**
 * Production only: install the service worker (offline use, "Add to Home Screen"), then,
 * once it controls the page and the page is idle, fetch the instrument samples through it
 * so the first Play doesn't wait for downloads (see shouldWarmSamples for when).
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => controlled())
      .then(() => {
        const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
        if (!shouldWarmSamples(connection, matchMedia(TOUCH_QUERY).matches)) return;
        const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000));
        idle(() => void warm(sampleUrls()));
      })
      .catch(() => {
        /* no offline support (private mode, old browser): the app works the same online */
      });
  });
}

async function warm(urls: string[]) {
  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      await fetch(url).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
}
