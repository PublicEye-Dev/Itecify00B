import type { ReactNode } from "react";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from "./modal.js";

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}): ReactNode {
  return (
    <ModalRoot
      open={open}
      onOpenChange={onOpenChange}
      variant="dialog"
      closeOnOverlayClick={true}
    >
      {children}
    </ModalRoot>
  );
}

export const DialogContent = ModalContent;
export const DialogHeader = ModalHeader;
export const DialogFooter = ModalFooter;
export const DialogTitle = ModalTitle;
export const DialogDescription = ModalDescription;
