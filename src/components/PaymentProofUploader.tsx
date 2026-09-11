import { FileText, Loader2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { extractReceiptData } from "../lib/receiptOcr";
import type { ReceiptOcrResult } from "../lib/receiptOcr";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

interface PaymentProofUploaderProps {
  onFileSelected: (file: File) => void;
  onExtracted: (result: ReceiptOcrResult) => void;
}

export function PaymentProofUploader({ onFileSelected, onExtracted }: PaymentProofUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setScanError("Formato no soportado. Sube una imagen JPG/PNG o un PDF.");
      return;
    }

    setScanError(null);
    setFileName(file.name);
    setIsPdf(file.type === "application/pdf");
    setPreviewUrl(file.type === "application/pdf" ? null : URL.createObjectURL(file));
    onFileSelected(file);

    setScanning(true);
    try {
      const result = await extractReceiptData(file);
      onExtracted(result);
      if (!result.referencia && !result.montoBs) {
        setScanError("No se pudo leer el comprobante automáticamente. Completa los datos manualmente.");
      }
    } catch {
      setScanError("No se pudo escanear el comprobante. Completa los datos manualmente.");
    } finally {
      setScanning(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
          dragOver ? "border-brand-neon bg-brand-neon/5" : "border-brand-card-border bg-surface hover:border-ink-muted"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        {previewUrl ? (
          <img src={previewUrl} alt="Vista previa del comprobante" className="h-24 w-24 rounded-lg object-cover" />
        ) : isPdf ? (
          <FileText size={32} className="text-brand-neon" />
        ) : (
          <UploadCloud size={28} className="text-ink-muted" />
        )}

        <div className="text-xs text-ink-muted">
          {fileName ? (
            <span className="font-semibold text-ink">{fileName}</span>
          ) : (
            <>
              Arrastra tu capture o recibo (JPG, PNG o PDF) o haz clic para adjuntarlo
            </>
          )}
        </div>

        {scanning && (
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-neon">
            <Loader2 size={12} className="animate-spin" /> Escaneando comprobante…
          </div>
        )}
      </div>

      {scanError && <p className="mt-2 text-[11px] text-brand-blue">{scanError}</p>}
    </div>
  );
}
