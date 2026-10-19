import { useEffect, type ReactNode } from "react";
import { useT } from "@/i18n/useT";
import { useStudioStore } from "@/stores/useStudioStore";

/**
 * Writes data-theme on <html> ("system" removes it so prefers-color-scheme decides)
 * and keeps <html lang> matching the UI language.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useStudioStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
  const { htmlLang } = useT();
  useEffect(() => {
    document.documentElement.lang = htmlLang;
  }, [htmlLang]);
  return <>{children}</>;
}
