import { SAMPLE_PACKS, samplePackUrl } from "@/audio/audioConfig";
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

/**
 * Production only: install the service worker (offline use, "Add to Home Screen"), then,
 * when the page is idle, fetch the instrument samples through it so the first Play doesn't
 * wait for downloads. Skipped when the browser asks to save data.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
        if (connection?.saveData) return;
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
