import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const BACKGROUND_COLOR = "#0F172A";
const ACCENT_COLOR = "#CCFF00";
const TEXT_COLOR = "#F8FAFC";
const MUTED_COLOR = "#94A3B8";

// Mismo isotipo que usa el sitio (Header.tsx, ProofCard.tsx), servido desde /public —
// vive fuera de dist-server, así que se resuelve relativo al cwd del proceso (igual
// que ROOT_DIR en index.ts), no relativo a este módulo compilado.
const LOGO_PATH = path.join(process.cwd(), "public/images/isotipo-monumento.jpeg");

// Fondo temático (ciclista + silueta del monumento) generado con Nano Banana Pro a
// partir del sello oficial y el isotipo del evento — mismo criterio de resolución que
// LOGO_PATH (relativo al cwd, no al módulo compilado en dist-server).
const BACKGROUND_IMAGE_PATH = path.join(process.cwd(), "public/images/certificado-fondo.jpg");

let logoBuffer: Buffer | null | undefined;
let backgroundImageBuffer: Buffer | null | undefined;

function getLogoBuffer(): Buffer | null {
  if (logoBuffer === undefined) {
    try {
      logoBuffer = readFileSync(LOGO_PATH);
    } catch {
      // Si el asset no está disponible (p. ej. un checkout parcial), el certificado
      // se sigue generando sin logo en vez de fallar el envío del correo/WhatsApp.
      logoBuffer = null;
    }
  }
  return logoBuffer;
}

function getBackgroundImageBuffer(): Buffer | null {
  if (backgroundImageBuffer === undefined) {
    try {
      backgroundImageBuffer = readFileSync(BACKGROUND_IMAGE_PATH);
    } catch {
      backgroundImageBuffer = null;
    }
  }
  return backgroundImageBuffer;
}

const ROUTE_LABELS: Record<string, string> = {
  "33K_REDOMA": "33K · Redoma",
  "22K_ILUSTRES": "22K · Ilustres",
};

export interface AthleteCertificateData {
  athleteId: string;
  fullName: string;
  ci: string;
  route: string;
  jerseySize: string;
  bibNumber: number | null;
  qrToken: string;
  email: string;
}

export async function generateCertificatePdf(athlete: AthleteCertificateData): Promise<Buffer> {
  // Mismo formato de payload que src/lib/qr.ts, para que un solo escáner
  // (check-in o verificación pública) reconozca ambos códigos QR.
  const qrPayload = `RVP-VERIFY:${athlete.athleteId}:${athlete.qrToken}`;
  const qrBuffer = await QRCode.toBuffer(qrPayload, {
    margin: 1,
    width: 240,
    color: { dark: "#0B0D0E", light: ACCENT_COLOR },
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const chunks: Buffer[] = [];

    // Sin archivos temporales: el PDF se arma enteramente en memoria y se
    // resuelve como Buffer cuando pdfkit termina de emitir el stream.
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { width, height } = doc.page;

    const backgroundImage = getBackgroundImageBuffer();
    if (backgroundImage) {
      doc.image(backgroundImage, 0, 0, { cover: [width, height] });
    } else {
      doc.rect(0, 0, width, height).fill(BACKGROUND_COLOR);
    }

    doc
      .lineWidth(2)
      .strokeColor(ACCENT_COLOR)
      .rect(24, 24, width - 48, height - 48)
      .stroke();

    // El fondo ilustrado pone contenido con mucho contraste propio (la Virgen, picos
    // claros) justo detrás del bloque de título/nombre — un panel oscuro semitransparente
    // detrás garantiza que el texto siga legible sin importar qué haya en esa zona de la
    // imagen. Se dibuja antes que el logo para que el logo quede encima, nítido.
    if (backgroundImage) {
      doc.fillOpacity(0.55);
      doc.roundedRect(40, 40, width - 80, 250, 14).fill(BACKGROUND_COLOR);
      doc.fillOpacity(1);
    }

    const logo = getLogoBuffer();
    if (logo) {
      const logoCenterX = 74;
      const logoCenterY = 66;
      const logoRadius = 32;
      doc.save();
      doc.circle(logoCenterX, logoCenterY, logoRadius).clip();
      doc.image(logo, logoCenterX - logoRadius, logoCenterY - logoRadius, {
        width: logoRadius * 2,
        height: logoRadius * 2,
      });
      doc.restore();
      doc.lineWidth(1.5).strokeColor(ACCENT_COLOR).circle(logoCenterX, logoCenterY, logoRadius).stroke();
    }

    doc
      .fillColor(ACCENT_COLOR)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("RETO VIRGEN DE LA PAZ", 0, 58, { align: "center", width });

    doc
      .fillColor(TEXT_COLOR)
      .font("Helvetica-Bold")
      .fontSize(32)
      .text("CERTIFICADO DE PARTICIPACIÓN", 0, 88, { align: "center", width });

    doc
      .fillColor(MUTED_COLOR)
      .font("Helvetica")
      .fontSize(13)
      .text("Se otorga el presente certificado a:", 0, 148, { align: "center", width });

    doc
      .fillColor(ACCENT_COLOR)
      .font("Helvetica-Bold")
      .fontSize(30)
      .text(athlete.fullName.toUpperCase(), 40, 178, { align: "center", width: width - 80 });

    const routeLabel = ROUTE_LABELS[athlete.route] ?? athlete.route;
    const bibLabel = athlete.bibNumber != null ? String(athlete.bibNumber) : "Sin asignar";

    const columns = [
      { label: "CÉDULA", value: athlete.ci },
      { label: "MODALIDAD", value: routeLabel },
      { label: "TALLA DE FRANELA", value: athlete.jerseySize },
      { label: "DORSAL", value: bibLabel },
    ];

    const detailsY = 250;
    const columnWidth = (width - 120) / columns.length;
    columns.forEach((col, i) => {
      const x = 60 + i * columnWidth;
      doc
        .fillColor(MUTED_COLOR)
        .font("Helvetica")
        .fontSize(10)
        .text(col.label, x, detailsY, { width: columnWidth, align: "center" });
      doc
        .fillColor(TEXT_COLOR)
        .font("Helvetica-Bold")
        .fontSize(16)
        .text(col.value, x, detailsY + 16, { width: columnWidth, align: "center" });
    });

    const qrSize = 110;
    const qrX = width - qrSize - 60;
    const qrY = height - qrSize - 70;
    const qrPad = 10;

    // Con el fondo ilustrado, el área bajo el QR puede tener cualquier combinación de
    // tonos (camino neón, ladera oscura, etc.) — una placa sólida detrás garantiza el
    // contraste dark/light del QR sin importar qué haya debajo, para que siga
    // escaneando de forma confiable en el paddock.
    doc
      .roundedRect(qrX - qrPad, qrY - qrPad, qrSize + qrPad * 2, qrSize + qrPad * 2, 10)
      .fill(BACKGROUND_COLOR);
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    doc
      .roundedRect(qrX - 30, qrY + qrSize + 6, qrSize + 60, 26, 6)
      .fill("#0B0D0E");
    doc
      .fillColor(MUTED_COLOR)
      .font("Helvetica")
      .fontSize(8)
      .text("Verifica la autenticidad escaneando el código QR", qrX - 30, qrY + qrSize + 10, {
        width: qrSize + 60,
        align: "center",
      });

    doc.end();
  });
}
