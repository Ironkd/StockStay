import React from "react";

type Props = {
  title: string;
  subtitle?: React.ReactNode;
  error?: string;
  loading?: boolean;
  maxWidth?: number | string;
  onClose: () => void;
  children: React.ReactNode;
  /** When provided, renders default Cancel + primary submit row */
  footer?: React.ReactNode;
};

/**
 * Shared overlay shell for Replenish / Return / Transfer modals.
 */
export const StockFlowModal: React.FC<Props> = ({
  title,
  subtitle,
  error,
  loading = false,
  maxWidth = 560,
  onClose,
  children,
  footer,
}) => {
  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        className="modal-content"
        style={{ maxWidth, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button
            type="button"
            className="icon-button close-button"
            onClick={onClose}
            aria-label="Close"
            disabled={loading}
          >
            ✕
          </button>
        </div>
        {subtitle && (
          <div style={{ marginTop: 0, marginBottom: "12px", color: "#64748b", fontSize: "14px" }}>
            {subtitle}
          </div>
        )}
        {children}
        {error && (
          <p style={{ color: "#b91c1c", fontSize: "14px" }} role="alert">
            {error}
          </p>
        )}
        {footer}
      </div>
    </div>
  );
};
