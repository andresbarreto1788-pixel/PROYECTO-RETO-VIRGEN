export interface ReceiptOcrResult {
  referencia: string | null;
  montoBs: number | null;
}

const REFERENCE_PATTERNS = [/referencia\D{0,15}(\d{4,})/i, /n[uú]mero\D{0,10}(\d{4,})/i, /ref\.?\D{0,10}(\d{4,})/i];

const AMOUNT_PATTERNS = [/(?:monto|bs\.?|total)\D{0,10}([\d.,]{2,})/i];

function parseVenezuelanAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  let normalized: string;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function findReference(text: string): string | null {
  for (const pattern of REFERENCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  const digitRun = text.match(/\b(\d{6,12})\b/);
  return digitRun ? digitRun[1] : null;
}

function findAmount(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = parseVenezuelanAmount(match[1]);
      if (value) return value;
    }
  }
  return null;
}

async function recognizeText(source: File | HTMLCanvasElement): Promise<string> {
  const { default: Tesseract } = await import("tesseract.js");
  const { data } = await Tesseract.recognize(source, "spa");
  return data.text;
}

async function renderPdfFirstPageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const pdfjsLib = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvas, viewport }).promise;
  return canvas;
}

export async function extractReceiptData(file: File): Promise<ReceiptOcrResult> {
  const text = file.type === "application/pdf" ? await recognizeText(await renderPdfFirstPageToCanvas(file)) : await recognizeText(file);

  return {
    referencia: findReference(text),
    montoBs: findAmount(text),
  };
}
