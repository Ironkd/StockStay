import React from "react";
import { Button } from "./Button";

type EmptyStateProps = {
  title: string;
  body?: React.ReactNode;
  error?: boolean;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/** Standard "nothing here yet" placeholder used across list/table views. */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  body,
  error = false,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}) => {
  const hasActions = Boolean((onPrimary && primaryLabel) || (onSecondary && secondaryLabel));
  return (
    <div className={error ? "empty-state error" : "empty-state"}>
      <h3>{title}</h3>
      {body != null ? <p>{body}</p> : null}
      {hasActions ? (
        <div className="empty-state-actions">
          {onPrimary && primaryLabel ? (
            <Button size="sm" onClick={onPrimary}>
              {primaryLabel}
            </Button>
          ) : null}
          {onSecondary && secondaryLabel ? (
            <Button variant="secondary" size="sm" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
