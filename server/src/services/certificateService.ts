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

// Foto real del Monumento a la Virgen de la Paz (Trujillo, Venezuela) — "El Magno
// Monumento" de José Luis Valero (Wikimedia Commons, usuario JHeavenOnEarth),
// licencia CC BY-SA 3.0: https://commons.wikimedia.org/wiki/File:El_Magno_Monumento..JPG
// Mismo criterio de resolución que LOGO_PATH (relativo al cwd, no al módulo
// compilado en dist-server).
const BACKGROUND_IMAGE_PATH = path.join(process.cwd(), "public/images/certificado-fondo.jpg");
const BACKGROUND_IMAGE_CREDIT = "Foto: José Luis Valero · CC BY-SA 3.0 · Wikimedia Commons";

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

function getMonumentPhotoBuffer(): Buffer | null {
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

    doc.rect(0, 0, width, height).fill(BACKGROUND_COLOR);

    // La foto real del monumento es un retrato vertical (tomada desde abajo, cielo
    // arriba y la Virgen ocupando el encuadre) — encaja mucho mejor como panel lateral
    // que como fondo a página completa, así el texto siempre queda sobre el navy sólido
    // y nunca compite con la imagen por contraste.
    const sidebarX = 24;
    const sidebarY = 24;
    const sidebarWidth = 260;
    const sidebarHeight = height - 48;
    const contentX = sidebarX + sidebarWidth + 36;
    const contentRight = width - 24;
    const contentWidth = contentRight - contentX;

    const monumentPhoto = getMonumentPhotoBuffer();
    if (monumentPhoto) {
      doc.save();
      doc.rect(sidebarX, sidebarY, sidebarWidth, sidebarHeight).clip();
      doc.image(monumentPhoto, sidebarX, sidebarY, {
        cover: [sidebarWidth, sidebarHeight],
        align: "center",
      });
      doc.restore();

      // Degradado hacia el navy en el borde derecho del panel para que la foto se
      // funda con el fondo en vez de cortar en seco contra el resto del certificado.
      const blend = doc.linearGradient(sidebarX + sidebarWidth - 60, 0, sidebarX + sidebarWidth, 0);
      blend.stop(0, BACKGROUND_COLOR, 0).stop(1, BACKGROUND_COLOR, 1);
      doc.rect(sidebarX + sidebarWidth - 60, sidebarY, 60, sidebarHeight).fill(blend);

      // Crédito de la foto real del monumento, exigido por su licencia CC BY-SA —
      // vertical y discreto sobre el propio panel de la foto.
      doc.save();
      doc.rotate(-90, { origin: [sidebarX + 14, sidebarY + sidebarHeight - 14] });
      doc
        .fillColor(TEXT_COLOR)
        .fillOpacity(0.75)
        .font("Helvetica")
        .fontSize(6)
        .text(BACKGROUND_IMAGE_CREDIT, sidebarX + 14 - 140, sidebarY + sidebarHeight - 14 - 6, {
          width: 280,
        });
      doc.fillOpacity(1);
      doc.restore();
    } else {
      doc.rect(sidebarX, sidebarY, sidebarWidth, sidebarHeight).fill("#111827");
    }

    doc
      .lineWidth(2)
      .strokeColor(ACCENT_COLOR)
      .rect(24, 24, width - 48, height - 48)
      .stroke();

    doc
      .lineWidth(1)
      .strokeColor(ACCENT_COLOR)
      .strokeOpacity(0.4)
      .moveTo(sidebarX + sidebarWidth, sidebarY)
      .lineTo(sidebarX + sidebarWidth, sidebarY + sidebarHeight)
      .stroke();
    doc.strokeOpacity(1);

    const logo = getLogoBuffer();
    if (logo) {
      // Chico y arriba del todo, para que quede claro del renglón "CERTIFICADO DE
      // PARTICIPACIÓN" (que se centra en todo el contentWidth) sin necesidad de
      // desplazar ese título del centro real de la tarjeta.
      const logoCenterX = contentX + 26;
      const logoCenterY = 40;
      const logoRadius = 22;
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
      .text("RETO VIRGEN DE LA PAZ", contentX, 58, { align: "center", width: contentWidth });

    doc
      .fillColor(TEXT_COLOR)
      .font("Helvetica-Bold")
      .fontSize(28)
      .text("CERTIFICADO DE PARTICIPACIÓN", contentX, 88, { align: "center", width: contentWidth });

    doc
      .fillColor(MUTED_COLOR)
      .font("Helvetica")
      .fontSize(13)
      .text("Se otorga el presente certificado a:", contentX, 148, { align: "center", width: contentWidth });

    doc
      .fillColor(ACCENT_COLOR)
      .font("Helvetica-Bold")
      .fontSize(28)
      .text(athlete.fullName.toUpperCase(), contentX, 178, { align: "center", width: contentWidth });

    const routeLabel = ROUTE_LABELS[athlete.route] ?? athlete.route;
    const bibLabel = athlete.bibNumber != null ? String(athlete.bibNumber) : "Sin asignar";

    const columns = [
      { label: "CÉDULA", value: athlete.ci },
      { label: "MODALIDAD", value: routeLabel },
      { label: "TALLA DE FRANELA", value: athlete.jerseySize },
      { label: "DORSAL", value: bibLabel },
    ];

    const detailsY = 250;
    const columnWidth = contentWidth / columns.length;
    columns.forEach((col, i) => {
      const x = contentX + i * columnWidth;
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
    const qrX = contentRight - qrSize;
    const qrY = height - qrSize - 70;

    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

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
