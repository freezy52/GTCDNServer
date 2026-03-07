import * as React from "react";

import { cn } from "@/lib/utils";

type ModalContextValue = {
  dismissible: boolean;
  onOpenChange: (open: boolean) => void;
};

const ModalContext = React.createContext<ModalContextValue | null>(null);

function useModalContext() {
  const context = React.useContext(ModalContext);
  if (!context) {
    throw new Error("Modal components must be used within Modal");
  }

  return context;
}

function Modal({
  open,
  onOpenChange,
  dismissible = true,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({ dismissible, onOpenChange }),
    [dismissible, onOpenChange],
  );

  React.useEffect(() => {
    if (!open || !dismissible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissible, onOpenChange, open]);

  if (!open) return null;

  return (
    <ModalContext.Provider value={value}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
        onClick={() => dismissible && onOpenChange(false)}
      >
        <div className="absolute inset-0 bg-background/80" aria-hidden="true" />
        {children}
      </div>
    </ModalContext.Provider>
  );
}

function ModalContent({ className, children, ...props }: React.ComponentProps<"div">) {
  useModalContext();

  return (
    <div
      className={cn(
        "relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );
}

function ModalHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-start justify-between gap-4", className)} {...props} />;
}

function ModalBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-6 space-y-4", className)} {...props} />;
}

function ModalFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-6 flex items-center justify-end gap-2", className)} {...props} />;
}

function ModalTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-xl font-semibold text-foreground", className)} {...props} />;
}

function ModalDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Modal, ModalBody, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle };
