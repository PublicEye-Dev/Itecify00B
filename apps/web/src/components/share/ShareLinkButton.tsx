import { useCallback, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.js";
import { useToast } from "../ui/toast.js";

export function ShareLinkButton({
  shareToken,
  workspaceName,
}: {
  shareToken: string;
  workspaceName: string;
}): ReactNode {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  const href = `${window.location.origin}/?join=${encodeURIComponent(shareToken)}`;

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(href);
      setDone(true);
      toast({
        title: "Link de invitație copiat",
        description: `Trimite-l rapid pentru a invita în ${workspaceName}.`,
        tone: "success",
      });
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      setFallbackOpen(true);
      toast({
        title: "Clipboard indisponibil",
        description: "Deschid un dialog ca să poți copia manual linkul.",
        tone: "warning",
      });
    }
  }, [href, toast, workspaceName]);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "4px 0",
          minWidth: 0,
        }}
      >
        <button
          type="button"
          onClick={() => void onCopy()}
          style={{
            border: "1px solid rgba(100, 199, 255, 0.28)",
            background:
              "linear-gradient(180deg, rgba(15, 74, 109, 0.78), rgba(10, 51, 76, 0.92))",
            color: "#d8f0ff",
            borderRadius: 12,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            boxShadow: "0 8px 20px rgba(8, 26, 40, 0.28)",
          }}
        >
          {done ? "Link copiat" : "Invită colaboratori"}
        </button>
        <span
          style={{
            fontSize: 11,
            color: "#8b9cb3",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 220,
          }}
          title={href}
        >
          {workspaceName}
        </span>
      </div>

      <Dialog open={fallbackOpen} onOpenChange={setFallbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiază linkul de invitație</DialogTitle>
            <DialogDescription>
              Browserul nu a permis copierea automată. Selectează linkul de mai
              jos și copiază-l manual.
            </DialogDescription>
          </DialogHeader>

          <input
            data-autofocus="true"
            readOnly
            value={href}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: 16,
              borderRadius: 14,
              border: "1px solid rgba(130, 160, 192, 0.24)",
              background: "rgba(8, 14, 22, 0.9)",
              color: "#e7eef7",
              padding: "12px 14px",
            }}
          />

          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setFallbackOpen(false);
              }}
              style={{
                border: "1px solid rgba(130, 160, 192, 0.24)",
                background: "transparent",
                color: "#c9d7e5",
                borderRadius: 12,
                padding: "10px 14px",
                cursor: "pointer",
              }}
            >
              Închide
            </button>
            <button
              type="button"
              onClick={() => {
                void onCopy();
              }}
              style={{
                border: "1px solid rgba(100, 199, 255, 0.28)",
                background:
                  "linear-gradient(180deg, rgba(15, 74, 109, 0.78), rgba(10, 51, 76, 0.92))",
                color: "#d8f0ff",
                borderRadius: 12,
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Încearcă din nou
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
