import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

// Paleta tomada del flyer oficial de la 5ta edición (fondo gris carbón con halftone
// de pinos, texto lima) en vez del navy original — mismo layout con la foto del
// monumento, solo cambia la paleta para que combine con las piezas de marketing.
// BACKGROUND_COLOR es el tono plano promedio de la textura (abajo), usado como color
// de relleno de respaldo y como destino de los degradados que funden la foto contra
// el fondo. El acento lima se mantiene: es el color de marca del sitio (botones,
// EVENT.*, etc.), no el gris/verde del fondo que se pidió cambiar.
const BACKGROUND_COLOR = "#2A2A2D";
const ACCENT_COLOR = "#CCFF00";
const TEXT_COLOR = "#F8FAFC";
const MUTED_COLOR = "#A6A6AA";

// Textura de fondo (halftone de puntos + silueta de pinos, desaturada a gris) tomada
// del mismo fondo que usan las piezas de marketing del organizador, para que el
// certificado no sea un color plano. Igual criterio de resolución que el resto de
// assets (relativo al cwd, no al módulo compilado en dist-server).
const BACKGROUND_TEXTURE_PATH = path.join(process.cwd(), "public/images/certificado-fondo-textura.jpg");

// Ciclista recortado de ese mismo fondo (silueta saltando), como elemento decorativo
// independiente — en el fondo completo caía encima del título, así que se coloca
// aparte en el hueco vacío entre la fila de datos y el QR.
const CYCLIST_CUTOUT_PATH = path.join(process.cwd(), "public/images/certificado-ciclista.png");

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
let backgroundTextureBuffer: Buffer | null | undefined;
let cyclistCutoutBuffer: Buffer | null | undefined;

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

function getBackgroundTextureBuffer(): Buffer | null {
  if (backgroundTextureBuffer === undefined) {
    try {
      backgroundTextureBuffer = readFileSync(BACKGROUND_TEXTURE_PATH);
    } catch {
      backgroundTextureBuffer = null;
    }
  }
  return backgroundTextureBuffer;
}

function getCyclistCutoutBuffer(): Buffer | null {
  if (cyclistCutoutBuffer === undefined) {
    try {
      cyclistCutoutBuffer = readFileSync(CYCLIST_CUTOUT_PATH);
    } catch {
      cyclistCutoutBuffer = null;
    }
  }
  return cyclistCutoutBuffer;
}

const ROUTE_LABELS: Record<string, string> = {
  "33K_REDOMA": "33K · Redoma",
  "22K_ILUSTRES": "22K · Ilustres",
};

const JERSEY_CUT_LABELS: Record<string, string> = {
  caballero: "Caballero",
  dama: "Dama",
};

export interface AthleteCertificateData {
  athleteId: string;
  fullName: string;
  ci: string;
  route: string;
  jerseyCut: string;
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
    color: { dark: "#10140F", light: ACCENT_COLOR },
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

    // Fondo del panel de contenido: el mismo arte de fondo (ciclista + pinos + halftone)
    // que usan las piezas de marketing del organizador, recortado sin el texto propio
    // del flyer. Va detrás de todo el texto, así que se dibuja aquí, antes del marco y
    // el resto de elementos.
    const bgPanelX = sidebarX + sidebarWidth;
    const bgPanelWidth = contentRight - bgPanelX;
    const backgroundTexture = getBackgroundTextureBuffer();
    if (backgroundTexture) {
      doc.save();
      doc.rect(bgPanelX, sidebarY, bgPanelWidth, sidebarHeight).clip();
      doc.image(backgroundTexture, bgPanelX, sidebarY, {
        cover: [bgPanelWidth, sidebarHeight],
        align: "center",
      });
      doc.restore();

      // Esa imagen tiene un cielo claro con un ciclista saltando en la mitad superior
      // (para que el ciclista no quede tapado por el título) y bosque oscuro abajo —
      // sin velo, el texto blanco/lima de toda la cabecera y la fila de datos quedaría
      // ilegible o compitiendo con las copas de los pinos. Se oscurece con un velo
      // fuerte arriba que nunca baja de un mínimo, para que todo el texto lea parejo
      // y el fondo quede como un detalle ambientado, no como protagonista.
      const scrim = doc.linearGradient(0, sidebarY, 0, sidebarY + sidebarHeight);
      scrim.stop(0, BACKGROUND_COLOR, 0.88).stop(0.45, BACKGROUND_COLOR, 0.6).stop(1, BACKGROUND_COLOR, 0.45);
      doc.rect(bgPanelX, sidebarY, bgPanelWidth, sidebarHeight).fill(scrim);
    }

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
      doc.rect(sidebarX, sidebarY, sidebarWidth, sidebarHeight).fill("#171D1A");
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
      // "CERTIFICADO DE PARTICIPACIÓN" (fontSize 28 bold) es casi tan ancho como
      // contentWidth, así que centrado deja muy poco margen a la izquierda antes de
      // su "C" — el logo se recuesta contra el divisor de la foto lateral, lejos del
      // título, en vez de centrarlo contra "RETO VIRGEN DE LA PAZ".
      const logoCenterX = contentX - 6;
      const logoCenterY = 56;
      const logoRadius = 24;
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

    const cutLabel = JERSEY_CUT_LABELS[athlete.jerseyCut] ?? athlete.jerseyCut;

    const columns = [
      { label: "CÉDULA", value: athlete.ci },
      { label: "MODALIDAD", value: routeLabel },
      { label: "TALLA DE FRANELA", value: `${athlete.jerseySize} · ${cutLabel}` },
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

    const cyclist = getCyclistCutoutBuffer();
    if (cyclist) {
      // Hueco libre entre la fila de datos (termina ~286) y el QR (empieza ~415):
      // el mismo ciclista saltando del fondo, recortado aparte para que no compita
      // con ningún texto.
      const cyclistHeight = 92;
      const cyclistWidth = cyclistHeight * (320 / 344);
      const cyclistZoneTop = detailsY + 36;
      const cyclistZoneBottom = height - 110 - 70;
      const cyclistX = contentX + (contentWidth - cyclistWidth) / 2;
      const cyclistY = cyclistZoneTop + (cyclistZoneBottom - cyclistZoneTop - cyclistHeight) / 2;
      doc.image(cyclist, cyclistX, cyclistY, { width: cyclistWidth, height: cyclistHeight });
    }

    const qrSize = 110;
    const qrCaptionWidth = qrSize + 60;
    const qrCaptionOverhang = (qrCaptionWidth - qrSize) / 2; // 30pt a cada lado del QR
    // El texto de abajo es más ancho que el QR — el QR se separa del borde derecho
    // lo suficiente para que esa franja centrada quepa entera dentro del marco
    // (con 10pt de margen) en vez de salirse por la derecha.
    const qrX = contentRight - qrSize - qrCaptionOverhang - 10;
    const qrY = height - qrSize - 70;

    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    doc
      .fillColor(MUTED_COLOR)
      .font("Helvetica")
      .fontSize(8)
      .text("Verifica la autenticidad escaneando el código QR", qrX - 30, qrY + qrSize + 10, {
        width: qrCaptionWidth,
        align: "center",
      });

    doc.end();
  });
}
