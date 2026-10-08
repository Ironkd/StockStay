import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export type ActionMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

type ActionMenuProps = {
  label?: string;
  ariaLabel: string;
  items: ActionMenuItem[];
};

export const ActionMenu: React.FC<ActionMenuProps> = ({
  label = "Manage",
  ariaLabel,
  items,
}) => {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);

  const updateMenuPosition = useCallback(() => {
    const summary = menuRef.current?.querySelector<HTMLElement>("summary");
    const menu = menuRef.current?.querySelector<HTMLElement>(".action-menu-items");
    if (!menuRef.current?.open || !summary || !menu) {
      setMenuPosition(null);
      return;
    }
    const rect = summary.getBoundingClientRect();
    const menuHeight = Math.min(menu.scrollHeight, window.innerHeight - 16);
    const below = rect.bottom + menuHeight + 4 <= window.innerHeight;
    const top = below ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
    setMenuPosition({ top, right: window.innerWidth - rect.right });
  }, []);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (menuRef.current?.open && !menuRef.current.contains(event.target as Node)) {
        menuRef.current.removeAttribute("open");
        setIsOpen(false);
        updateMenuPosition();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuRef.current?.open) {
        menuRef.current.removeAttribute("open");
        setIsOpen(false);
        menuRef.current.querySelector<HTMLElement>("summary")?.focus();
        updateMenuPosition();
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [updateMenuPosition]);

  const handleToggle = useCallback(() => {
    setIsOpen(Boolean(menuRef.current?.open));
    updateMenuPosition();
  }, [updateMenuPosition]);

  useEffect(() => {
    if (isOpen) updateMenuPosition();
  }, [isOpen, updateMenuPosition]);

  return (
    <details className="action-menu" ref={menuRef} onToggle={handleToggle}>
      <summary aria-label={ariaLabel} aria-haspopup="menu">
        {label}
        <Icon name="chevron-down" size={14} />
      </summary>
      <div
        className="action-menu-items"
        role="menu"
        hidden={!isOpen}
        style={menuPosition ?? undefined}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={item.danger ? "action-menu-item danger" : "action-menu-item"}
            disabled={item.disabled}
            onClick={() => {
              menuRef.current?.removeAttribute("open");
              setIsOpen(false);
              updateMenuPosition();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
};
