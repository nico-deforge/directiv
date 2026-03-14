import { useEffect, useRef, useCallback } from "react";

/**
 * Keyboard navigation hook for custom dropdown menus.
 * Handles Escape (close), ArrowUp/Down (navigate items with circular wrapping),
 * Home/End (jump to first/last), Tab (close). Enter/Space selection is
 * delegated to native button behavior.
 * Returns focus to the trigger element when the menu closes via Escape or Tab.
 *
 * Usage:
 *   const menuRef = useRef<HTMLDivElement>(null);
 *   const triggerRef = useRef<HTMLButtonElement>(null);
 *   useMenuKeyboard({ isOpen, onClose, menuRef, triggerRef });
 *
 * Menu items must be focusable: enabled buttons, anchors with href,
 * or elements with a non-negative tabindex.
 */
export function useMenuKeyboard({
  isOpen,
  onClose,
  menuRef,
  triggerRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  menuRef: React.RefObject<HTMLElement | null>;
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  // Ref avoids stale closure: onClose can change without recreating the keydown handler
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus first item when menu opens
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const firstItem = getFocusableItems(menuRef.current)[0];
    firstItem?.focus();
  }, [isOpen, menuRef]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || !menuRef.current) return;

      // Only handle keys when focus is inside the menu or on the trigger
      const active = document.activeElement;
      const isInMenu = menuRef.current.contains(active);
      const isOnTrigger = triggerRef?.current === active;
      if (!isInMenu && !isOnTrigger) return;

      const items = getFocusableItems(menuRef.current);
      const currentIndex = active ? items.indexOf(active as HTMLElement) : -1;

      switch (e.key) {
        case "Escape": {
          e.preventDefault();
          // stopPropagation prevents parent Escape handlers (e.g., modals, ReactFlow) from also firing
          e.stopPropagation();
          const trigger = triggerRef?.current;
          onCloseRef.current();
          trigger?.focus();
          break;
        }
        case "ArrowDown":
          e.preventDefault();
          if (items.length === 0) break;
          if (currentIndex < 0 || currentIndex >= items.length - 1) {
            items[0].focus();
          } else {
            items[currentIndex + 1].focus();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (items.length === 0) break;
          if (currentIndex <= 0) {
            items[items.length - 1].focus();
          } else {
            items[currentIndex - 1].focus();
          }
          break;
        case "Home":
          e.preventDefault();
          if (items.length === 0) break;
          items[0].focus();
          break;
        case "End":
          e.preventDefault();
          if (items.length === 0) break;
          items[items.length - 1].focus();
          break;
        case "Tab": {
          e.preventDefault();
          const trigger = triggerRef?.current;
          onCloseRef.current();
          trigger?.focus();
          break;
        }
      }
    },
    [isOpen, menuRef, triggerRef],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);
}

function getFocusableItems(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  );
}
