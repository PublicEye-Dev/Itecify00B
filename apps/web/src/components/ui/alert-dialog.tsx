import type { ReactNode } from "react";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from "./modal.js";

export function AlertDialog({
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
      variant="alert"
      closeOnOverlayClick={false}
    >
      {children}
    </ModalRoot>
  );
}

export const AlertDialogContent = ModalContent;
export const AlertDialogHeader = ModalHeader;
export const AlertDialogFooter = ModalFooter;
export const AlertDialogTitle = ModalTitle;
export const AlertDialogDescription = ModalDescription;
