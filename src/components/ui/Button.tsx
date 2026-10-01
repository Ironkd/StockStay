import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const variantClassName: Record<Variant, string> = {
  primary: "",
  secondary: "secondary",
  ghost: "ghost",
  danger: "danger",
};

/**
 * Shared button. Renders a native <button> styled by the global button rules
 * in styles.css (which already implement the primary/secondary/ghost/danger
 * variants) so existing bare <button> usage across the app keeps working
 * unchanged while new/migrated code gets a typed, consistent API.
 */
export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  children,
  ...rest
}) => {
  const classes = [
    variantClassName[variant],
    size === "sm" ? "btn-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes || undefined} {...rest}>
      {children}
    </button>
  );
};
