import { useStudioStore } from "@/stores/useStudioStore";
import { STRINGS, type Strings } from "./strings";

/** UI strings in the current language. Re-renders when the language changes. */
export function useT(): Strings {
  return STRINGS[useStudioStore((s) => s.settings.language)];
}

/** Same as useT, for code outside React (store callbacks, async handlers). */
export function getT(): Strings {
  return STRINGS[useStudioStore.getState().settings.language];
}
