import { sampleUrls, shouldWarmSamples } from "./registerServiceWorker";

describe("offline sample warm-up", () => {
  it("downloads the samples ahead only on a connection known to be fast and unmetered", () => {
    expect(shouldWarmSamples({ type: "wifi", effectiveType: "4g" }, true)).toBe(true);
    expect(shouldWarmSamples({ effectiveType: "4g" }, true)).toBe(true);
    // Safari and Firefox say nothing: a phone waits for Play, a computer fetches them all
    expect(shouldWarmSamples(undefined, true)).toBe(false);
    expect(shouldWarmSamples(undefined, false)).toBe(true);
    expect(shouldWarmSamples({ type: "cellular", effectiveType: "4g" }, false)).toBe(false);
    expect(shouldWarmSamples({ effectiveType: "3g" }, false)).toBe(false);
    expect(shouldWarmSamples({ saveData: true, type: "wifi" }, false)).toBe(false);
  });

  it("lists every sample of every pack, soft layers included, under the site's base path", () => {
    const urls = sampleUrls();
    expect(urls.length).toBeGreaterThan(60);
    expect(urls.every((u) => u.startsWith(import.meta.env.BASE_URL + "instruments/"))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
