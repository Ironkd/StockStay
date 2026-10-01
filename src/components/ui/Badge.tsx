import React from "react";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClass: Record<BadgeTone, string> = {
  success: "status-ok",
  warning: "status-low",
  danger: "status-out",
  info: "status-info",
  neutral: "status-neutral",
};

type BadgeProps = {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
};

/** Small inline status/category pill. Use for stock status, plan tier, invoice status, etc. */
export const Badge: React.FC<BadgeProps> = ({ tone = "neutral", children, className }) => {
  const classes = ["status-pill", toneClass[tone]];
  if (className) classes.push(className);
  return <span className={classes.join(" ")}>{children}</span>;
};
