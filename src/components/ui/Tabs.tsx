import React from "react";

export type TabItem = {
  key: string;
  label: string;
  count?: number;
};

type TabsProps = {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
};

/** Underline-style tab bar. Use for switching between views within a single page (e.g. property details, settings). */
export const Tabs: React.FC<TabsProps> = ({ items, active, onChange, className }) => {
  const classes = ["tabs"];
  if (className) classes.push(className);
  return (
    <div className={classes.join(" ")} role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === active}
          className={item.key === active ? "tab active" : "tab"}
          onClick={() => onChange(item.key)}
        >
          {item.label}
          {item.count != null ? <span className="tab-count">({item.count})</span> : null}
        </button>
      ))}
    </div>
  );
};
