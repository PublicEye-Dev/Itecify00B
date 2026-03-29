import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ModalVariant = "dialog" | "alert";

type ModalContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  variant: ModalVariant;
  closeOnOverlayClick: boolean;
};

type ModalRootProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: ModalVariant;
  closeOnOverlayClick: boolean;
  children: ReactNode;
};

const ModalContext = createContext<ModalContextValue | null>(null);

function useModalContext(componentName: string): ModalContextValue {
  const value = useContext(ModalContext);
  if (!value) {
    throw new Error(`${componentName} must be used inside a modal root.`);
  }
  return value;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      [
        "button:not([disabled])",
        "[href]",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
      ].join(","),
    ),
  ).filter((node) => !node.hasAttribute("hidden") && !node.ariaHidden);
}

function focusInitialElement(container: HTMLElement): void {
  const preferred = container.querySelector<HTMLElement>(
    "[data-autofocus='true']",
  );
  if (preferred) {
    preferred.focus();
    return;
  }

  const [firstFocusable] = getFocusableElements(container);
  if (firstFocusable) {
    firstFocusable.focus();
    return;
  }

  container.focus();
}

function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;

  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement as HTMLElement | null;

  if (event.shiftKey) {
    if (active === first || active === container) {
      event.preventDefault();
      last?.focus();
    }
    return;
  }

  if (active === last) {
    event.preventDefault();
    first?.focus();
  }
}

export function ModalRoot({
  open,
  onOpenChange,
  variant,
  closeOnOverlayClick,
  children,
}: ModalRootProps): ReactNode {
  const titleId = useId();
  const descriptionId = useId();

  const value = useMemo(
    () => ({
      open,
      onOpenChange,
      titleId,
      descriptionId,
      variant,
      closeOnOverlayClick,
    }),
    [open, onOpenChange, titleId, descriptionId, variant, closeOnOverlayClick],
  );

  return (
    <ModalContext.Provider value={value}>{children}</ModalContext.Provider>
  );
}

export function ModalContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  const {
    open,
    onOpenChange,
    titleId,
    descriptionId,
    variant,
    closeOnOverlayClick,
  } = useModalContext("ModalContent");
  const contentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || !contentRef.current) return;

    const previousOverflow = document.body.style.overflow;
    const previousActive = document.activeElement as HTMLElement | null;
    const content = contentRef.current;

    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      trapFocus(content, event);
    };

    requestAnimationFrame(() => {
      focusInitialElement(content);
    });

    content.addEventListener("keydown", onKeyDown);
    return () => {
      content.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActive?.focus?.();
    };
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="itecify-modal-layer"
      onMouseDown={() => {
        if (closeOnOverlayClick) {
          onOpenChange(false);
        }
      }}
    >
      <section
        ref={(node) => {
          contentRef.current = node;
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-variant={variant}
        className={`itecify-modal-surface${className ? ` ${className}` : ""}`}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function ModalHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactNode {
  return (
    <div
      className={`itecify-modal-header${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}

export function ModalFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactNode {
  return (
    <div
      className={`itecify-modal-footer${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}

export function ModalTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>): ReactNode {
  const { titleId } = useModalContext("ModalTitle");
  return (
    <h2
      id={titleId}
      className={`itecify-modal-title${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}

export function ModalDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): ReactNode {
  const { descriptionId } = useModalContext("ModalDescription");
  return (
    <p
      id={descriptionId}
      className={`itecify-modal-description${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}
