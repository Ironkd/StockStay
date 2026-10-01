import React from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles confirm as destructive (delete/revoke) */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = "Confirm",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal open={open} onClose={onCancel} title={title} busy={busy} maxWidth="420px">
      <div className="confirm-dialog-body">
        {typeof message === "string" ? <p>{message}</p> : message}
        <div className="form-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Please wait…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
