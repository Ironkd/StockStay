import React from "react";

type SectionHeaderProps = {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
};

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  actions,
  compact = false,
}) => (
  <div className={`section-header${compact ? " section-header-compact" : ""}`}>
    <div className="section-header-copy">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
    {actions ? <div className="section-header-actions">{actions}</div> : null}
  </div>
);
