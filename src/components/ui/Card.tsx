import React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Removes the default padding, useful when the card contains its own full-bleed content (e.g. a table). */
  noPadding?: boolean;
};

/** Standard elevated content container. Wraps the existing `.panel` styling. */
export const Card: React.FC<CardProps> = ({ noPadding = false, className, children, ...rest }) => {
  const classes = ["panel"];
  if (noPadding) classes.push("panel-flush");
  if (className) classes.push(className);
  return (
    <div className={classes.join(" ")} {...rest}>
      {children}
    </div>
  );
};
