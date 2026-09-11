import { Html5Qrcode } from "html5-qrcode";
import { CheckCircle2, ScanLine, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, adminGet, adminPost } from "../../lib/api";
import { formatUsd } from "../../lib/format";
import type { CheckInPreview, CheckInResult } from "../../types/admin";

const READER_ID = "rvp-qr-reader";

const ROUTE_LABEL: Record<string, string> = { "33K_REDOMA": "33K — Redoma", "22K_ILUSTRES": "22K — Ilustres" };

function extractQrToken(decodedText: string): string | null {
  const parts = decodedText.split(":");
  return parts.length === 3 && parts[0] === "RVP-VERIFY" ? parts[2] : null;
}

export function QrScannerPanel({ onCheckedIn }: { onCheckedIn: () => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CheckInPreview | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleDecoded = useCallback(async (decodedText: string) => {
    const token = extractQrToken(decodedText);
    if (!token) return;

    await scannerRef.current?.pause(true);
    setError(null);
    setQrToken(token);

    try {
      const data = await adminGet<CheckInPreview>(`/api/admin/check-in/preview/${token}`);
      setPreview(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo leer el QR.");
    }
  }, []);

  const startScanning = useCallback(async () => {
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(READER_ID);
    }
    try {
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          handleDecoded(decodedText);
        },
        undefined,
      );
      setCameraError(null);
    } catch {
      setCameraError("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
    }
  }, [handleDecoded]);

  useEffect(() => {
    startScanning();
    return () => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      // html5-qrcode throws synchronously (not a rejected promise) if stop() is
      // called while it never managed to start (e.g. camera permission denied).
      if (scanner.isScanning) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
      } else {
        try {
          scanner.clear();
        } catch {
          // nada que limpiar si nunca llegó a inicializar la cámara
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setPreview(null);
    setResult(null);
    setQrToken(null);
    setError(null);
    scannerRef.current?.resume();
  }

  async function handleConfirm() {
    if (!qrToken) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await adminPost<CheckInResult>("/api/admin/check-in", { qrToken });
      setResult(res);
      onCheckedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar el check-in.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-brand-card-border bg-brand-card">
        <div id={READER_ID} className="mx-auto max-w-sm" />
        {cameraError && <p className="p-4 text-center text-xs text-brand-blue">{cameraError}</p>}
      </div>

      {error && <p className="text-center text-xs font-semibold text-brand-blue">{error}</p>}

      {preview && !result && (
        <div className="rounded-2xl border border-brand-neon/40 bg-surface p-6 text-center">
          <p className="text-hud text-[10px] uppercase tracking-widest text-ink-muted">Atleta escaneado</p>
          <p className="mt-2 text-2xl font-black uppercase text-ink">{preview.fullName}</p>
          <p className="mt-1 text-sm text-ink-muted">{ROUTE_LABEL[preview.route] ?? preview.route}</p>

          <p className="mt-6 text-[10px] uppercase tracking-widest text-ink-muted">Talla de franela a entregar</p>
          <p className="text-6xl font-black text-brand-neon">{preview.jerseySize}</p>

          {preview.checkedIn ? (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-blue/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-brand-blue">
              <CheckCircle2 size={16} /> Ya hizo check-in {preview.bibNumber ? `· Dorsal #${preview.bibNumber}` : ""}
            </p>
          ) : preview.paymentStatus === "PAID" ? (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-neon/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-brand-neon">
              <CheckCircle2 size={16} /> Solvente — listo para dorsal
            </p>
          ) : (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-400">
              <XCircle size={16} /> Saldo pendiente: {formatUsd(preview.owedUsd)} — cobrar en taquilla
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {!preview.checkedIn && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 rounded-full bg-brand-neon px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-surface shadow-neon disabled:opacity-60"
              >
                {confirming ? "Confirmando…" : "Confirmar Check-in"}
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="flex-1 rounded-full border border-brand-card-border px-6 py-3 text-xs font-bold uppercase tracking-wide text-ink-muted"
            >
              Escanear siguiente
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-brand-neon/40 bg-surface p-6 text-center">
          <CheckCircle2 size={32} className="mx-auto text-brand-neon" />
          <p className="mt-3 text-2xl font-black uppercase text-ink">{result.fullName}</p>
          {"bibNumber" in result && (
            <p className="mt-2 text-hud text-4xl font-black text-brand-neon">Dorsal #{result.bibNumber}</p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-6 w-full rounded-full bg-brand-neon px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-surface shadow-neon"
          >
            Escanear siguiente atleta
          </button>
        </div>
      )}

      {!preview && !result && (
        <p className="flex items-center justify-center gap-2 text-xs text-ink-muted">
          <ScanLine size={14} /> Apunta la cámara al QR del carnet del atleta.
        </p>
      )}
    </div>
  );
}
