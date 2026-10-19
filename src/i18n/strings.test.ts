import { STRINGS, detectLanguage } from "./strings";

/** Every key, including nested ones, so a string missing from one language shows up. */
function keyPaths(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keyPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("UI strings", () => {
  it("has the same keys in English and Chinese", () => {
    expect(keyPaths(STRINGS.zh).sort()).toEqual(keyPaths(STRINGS.en).sort());
  });

  it("formats with parameters in both languages", () => {
    expect(STRINGS.en.barBeat(3, 2)).toBe("Bar 3, beat 2");
    expect(STRINGS.zh.barBeat(3, 2)).toBe("第 3 小节 第 2 拍");
    expect(STRINGS.en.loadedLeftOut("a.mid", 1)).toBe("Loaded a.mid. 1 track left out.");
    expect(STRINGS.en.mappingIntro("a.mid", 2)).toMatch(/^a\.mid has 2 tracks\./);
  });

  it("picks Chinese for zh browsers only", () => {
    const spy = vi.spyOn(navigator, "language", "get");
    spy.mockReturnValue("zh-TW");
    expect(detectLanguage()).toBe("zh");
    spy.mockReturnValue("en-GB");
    expect(detectLanguage()).toBe("en");
    spy.mockRestore();
  });
});
