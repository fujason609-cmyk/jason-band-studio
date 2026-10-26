import { useSyncExternalStore } from "react";

/**
 * The PK pages live behind the URL's hash (#/pk, #/pk/lab): GitHub Pages has no server to
 * route paths, and a hash link can be shared and reloaded.
 */
export type PkRoute = "pk" | "lab" | null;

export function routeOf(hash: string): PkRoute {
  if (/^#\/pk\/lab\/?$/.test(hash)) return "lab";
  if (/^#\/pk\/?$/.test(hash)) return "pk";
  return null;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

export function usePkRoute(): PkRoute {
  return useSyncExternalStore(subscribe, () => routeOf(window.location.hash), () => null);
}

export function goTo(route: PkRoute) {
  if (route) window.location.hash = route === "lab" ? "#/pk/lab" : "#/pk";
  else {
    // back to the studio, without a bare "#" left in the address
    history.pushState(null, "", window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
}
