import { useEffect, useRef, useCallback } from "react";

/**
 * Keyboard navigation hook for custom dropdown menus.
 * Handles Escape (close), ArrowUp/Down (navigate items), Enter/Space (select).
 * Returns focus to the trigger element when the menu closes.
 *
 * Usage:
 *   const menuRef = useRef<HTMLDivElement>(null);
 *   const triggerRef = useRef<HTMLButtonElement>(null);
 *   useMenuKeyboard({ isOpen, onClose, menuRef, triggerRef });
 *
 * Requires menu items to be focusable elements (button, a, [tabindex]).
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

      const items = getFocusableItems(menuRef.current);
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current();
          triggerRef?.current?.focus();
          break;
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
          items[0]?.focus();
          break;
        case "End":
          e.preventDefault();
          items[items.length - 1]?.focus();
          break;
        case "Tab":
          // Close menu on Tab to avoid focus escaping without closing
          onCloseRef.current();
          break;
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
