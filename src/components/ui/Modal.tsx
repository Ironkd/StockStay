import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Max width of the dialog panel */
  maxWidth?: string | number;
  /** Disable overlay click / Escape close (e.g. while saving) */
  busy?: boolean;
  className?: string;
};

/**
 * Accessible modal: portal, role=dialog, Escape to close, basic focus trap.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidth = "520px",
  busy = false,
  className = "modal-content",
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);

  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const input = panel?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );
    const focusable =
      input ??
      panel?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
    focusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const nodes = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
      >
        {title != null && (
          <div className="modal-header">
            <h3 id={titleId}>{title}</h3>
            <button
              type="button"
              className="icon-button close-button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
};
