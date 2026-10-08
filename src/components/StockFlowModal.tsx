import React from "react";
import { Modal } from "./ui/Modal";

type Props = {
  title: string;
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
  error,
  loading = false,
  maxWidth = 560,
  onClose,
  children,
  footer,
}) => {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      maxWidth={maxWidth}
      busy={loading}
      className="modal-content stock-modal"
    >
      {children}
      {error ? (
        <p className="form-banner error" role="alert">
          {error}
        </p>
      ) : null}
      {footer}
    </Modal>
  );
};
