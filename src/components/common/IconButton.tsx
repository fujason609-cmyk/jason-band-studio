import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  variant?: "plain" | "solid" | "quiet";
  pressed?: boolean;
}

/** Icon-only button. `label` is required so screen readers announce it. */
export function IconButton({ label, children, variant = "plain", pressed, className = "", ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`icon-btn icon-btn--${variant} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
