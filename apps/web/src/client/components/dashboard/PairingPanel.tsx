import { useState } from "react";
import { Smartphone, X, Loader2 } from "lucide-react";
import type { PairingResponse } from "../../../shared/types";
export function PairingPanel({
  pairing,
  onCreatePairing,
}: {
  pairing: PairingResponse | null;
  onCreatePairing: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function pair() {
    setBusy(true);
    setError("");
    try {
      await onCreatePairing();
    } catch {
      setError("Kopplung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sync-control">
      <button
        className="quiet-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Smartphone size={16} /> iPhone koppeln
      </button>
      {open && (
        <div className="sync-popover" role="region" aria-label="iPhone koppeln">
          <button
            className="popover-close"
            aria-label="Kopplung schließen"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
          <h3>Mit Apple Health verbinden</h3>
          <p>QR-Code mit der iPhone-Kamera scannen.</p>
          {pairing ? (
            <>
              <img
                src={pairing.qrDataUrl}
                alt="QR-Code zum Koppeln der Health-App"
                width={180}
                height={180}
              />
              <a className="primary-button" href={pairing.pairingUrl}>
                Auf diesem iPhone öffnen
              </a>
            </>
          ) : (
            <button className="primary-button" disabled={busy} onClick={pair}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : null}{" "}
              QR-Code anzeigen
            </button>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
