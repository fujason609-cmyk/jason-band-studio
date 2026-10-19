import { useEffect, type ReactNode } from "react";
import { useStudioStore } from "@/stores/useStudioStore";

/** Writes data-theme on <html>; "system" removes it so prefers-color-scheme decides. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useStudioStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
  return <>{children}</>;
}
