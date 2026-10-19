import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// jsdom has no matchMedia: behave like a wide, mouse-driven screen.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
