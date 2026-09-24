import type { ElevationPoint, JerseyCut, KitItem, PaymentMethod, RacePhase, RouteModality, Sponsor } from "../types/race";

export const EVENT = {
  edition: "5ta Edición",
  raceName: "Reto Virgen de la Paz",
  location: "Trujillo, Venezuela",
  distanceKm: 33,
  elevationGainM: 1200,
  summitHeightM: 46.72,
  instagram: "@retovirgendelapaz",
  // Número del chatbot (Biker) — atención general / chat automático en la página.
  whatsapp: "+58 422-0571234",
  whatsappDigits: "584220571234",
  // Número de Gustavo Briceño — referente humano y verificador de pagos.
  organizerWhatsapp: "+58 414-0746270",
  organizerWhatsappDigits: "584140746270",
};

export const HUD_STATS = [
  { label: "Distancia", value: "33", unit: "KM" },
  { label: "Desnivel +", value: "1.200", unit: "M D+" },
  { label: "Cima Monumento", value: "46,72", unit: "M" },
] as const;

export const PHASES: RacePhase[] = [
  {
    id: "salida",
    index: 1,
    title: "Salida y Bendición",
    kicker: "Fase 01 · Redoma Letras Trujillo",
    description:
      "El pelotón sale desde la icónica redoma de las letras TRUJILLO. La caravola de la Virgen abre paso entre el bullicio de los ciclistas, marcando el inicio simbólico y espiritual del reto.",
    image: "/images/sello-oficial.jpeg",
  },
  {
    id: "altimetria",
    index: 2,
    title: "Altimetría y Desafío",
    kicker: "Fase 02 · Curvas entre pinos",
    description:
      "El terreno se empina en un ascenso serpenteante por curvas cerradas entre pinos. Pendientes máximas exigentes y puntos de hidratación estratégicos sostienen al ciclista rumbo a la cima.",
    image: "/images/flyer-5ta-edicion.jpeg",
  },
  {
    id: "monumento",
    index: 3,
    title: "El Monumento",
    kicker: "Fase 03 · Cumbre · 46,72 m",
    description:
      "En la cima, bajo el arco, espera el Monumento a la Virgen de la Paz. Aquí se entrega el kit oficial: medalla conmemorativa troquelada, dorsal numerado y jersey de finisher.",
    image: "/images/isotipo-monumento.jpeg",
  },
  {
    id: "meta",
    index: 4,
    title: "Meta & Paddock",
    kicker: "Fase 04 · Tarima de premiación",
    description:
      "Llegada triunfal al paddock. La tarima recibe a cada finisher mientras la zona de premiación celebra el esfuerzo colectivo de todo el pelotón trujillano, sin importar el ritmo de cada quien.",
    image: "/images/medalla-2027.jpeg",
  },
];

export const ELEVATION_PROFILE: ElevationPoint[] = [
  { km: 0, meters: 620, label: "Redoma Trujillo" },
  { km: 4, meters: 680 },
  { km: 8, meters: 810, label: "1er punto de hidratación" },
  { km: 12, meters: 960 },
  { km: 16, meters: 1180, label: "Curvas entre pinos" },
  { km: 20, meters: 1340, label: "2do punto de hidratación" },
  { km: 24, meters: 1520 },
  { km: 28, meters: 1690, label: "Pendiente máxima 14%" },
  { km: 31, meters: 1790 },
  { km: 33, meters: 1820, label: "Monumento · Cima" },
];

export const ROUTE_MODALITIES: RouteModality[] = [
  {
    id: "reto-33k",
    label: "Reto Completo 33K",
    distanceKm: 33,
    startPoint: "Redoma de Trujillo",
    finishPoint: "Monumento Virgen de la Paz (46,72 m)",
    description: "El recorrido completo, de redoma a cumbre. Paseo / cicloturismo: cada quien a su propio ritmo.",
    priceUsd: 30,
  },
  {
    id: "reto-22k",
    label: "Reto Medio 22K",
    distanceKm: 22,
    startPoint: "Parque Los Ilustres",
    finishPoint: "Monumento Virgen de la Paz (46,72 m)",
    description: "Una salida más corta hacia la misma cumbre. Paseo / cicloturismo: cada quien a su propio ritmo.",
    priceUsd: 30,
  },
];

// Inscripción grupal: a partir de este número de integrantes el equipo recibe el
// descuento. Por debajo del mínimo el equipo igual se puede inscribir, solo que sin
// descuento.
export const TEAM_DISCOUNT_MIN_SIZE = 10;
export const TEAM_DISCOUNT_PERCENT = 10;

export const PAYMENT_INFO = {
  banco: "Banco Provincial",
  bancoCodigo: "0108",
  cuenta: "0108-0377-20-0100049415",
  pagoMovil: {
    banco: "0108 (Banco Provincial)",
    cedula: "18924508",
    telefono: "0414-0746270",
  },
  zelle: {
    telefono: "812-4935873",
    titular: "Jhaiderson Pacheco",
  },
  binancePay: {
    idBinance: "87916836",
    usuario: "zero2024",
  },
};

// Etiquetas legibles de cada método de pago — usadas tanto en el <select> del
// formulario de inscripción como en el mensaje de WhatsApp del comprobante, para que
// ambos lugares queden sincronizados con un solo cambio si se agrega un método nuevo.
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  "pago-movil": "Pago Móvil",
  transferencia: "Transferencia / Depósito",
  zelle: "Zelle",
  "binance-pay": "Binance Pay",
};

// Íconos pequeños (recortados de los QR reales o construidos en el componente para
// Zelle, que no tiene imagen propia) usados solo para identificar de un vistazo cada
// método de pago junto a su nombre — nunca se muestran a tamaño grande.
export const PAYMENT_METHOD_LOGOS = {
  bancoProvincial: "/images/logo-banco-provincial.png",
  binance: "/images/logo-binance.png",
};

export interface PaymentQrCode {
  id: string;
  label: string;
  holderName: string;
  image: string;
  logo?: string;
}

// Códigos QR de métodos de pago (Pago Móvil, Binance Pay, etc.), mostrados como galería
// en el conversor de moneda. Agregar uno nuevo aquí (+ la imagen en public/images/) es
// suficiente: el componente que los renderiza no necesita cambios.
export const PAYMENT_QR_CODES: PaymentQrCode[] = [
  {
    id: "pago-movil-bbva",
    label: "Pago Móvil · BBVA Provincial",
    holderName: "Gustavo Alejandro Briceño Linares",
    image: "/images/qr-pago-movil-bbva.png",
    logo: PAYMENT_METHOD_LOGOS.bancoProvincial,
  },
  {
    id: "binance-pay",
    label: "Binance Pay",
    holderName: "ID Binance: 87916836 (zero2024)",
    image: "/images/qr-binance-pay.png",
    logo: PAYMENT_METHOD_LOGOS.binance,
  },
];

export const KIT_ITEMS: KitItem[] = [
  {
    id: "medalla",
    title: "Medalla Conmemorativa Troquelada",
    description: "Diseño oficial de la edición con cinta serigrafiada de patrocinadores.",
    image: "/images/medalla-2026.jpeg",
  },
  {
    id: "dorsal",
    title: "Dorsal Numerado",
    description: "Identificación oficial del atleta durante todo el recorrido.",
  },
  {
    id: "jersey",
    title: "Jersey Oficial de Finisher (Manga Larga)",
    description:
      "Diseño con pinos andinos y el logo oficial de la Virgen. Disponible en corte caballero (tallas S a XXL) y corte dama (tallas XS a XL).",
    image: "/images/jersey-front.jpeg",
  },
];

export const JERSEY_IMAGES = {
  front: "/images/jersey-front.jpeg",
  back: "/images/jersey-back.jpeg",
};

export const JERSEY_CUTS: { id: JerseyCut; label: string }[] = [
  { id: "caballero", label: "Caballero" },
  { id: "dama", label: "Dama" },
];

export const JERSEY_SIZES_BY_CUT: Record<JerseyCut, readonly string[]> = {
  caballero: ["S", "M", "L", "XL", "XXL"],
  dama: ["XS", "S", "M", "L", "XL"],
};

// Compatibilidad con el corte por defecto (caballero) para código que todavía no
// distingue por corte.
export const JERSEY_SIZES = JERSEY_SIZES_BY_CUT.caballero;

export const SPONSORS: Sponsor[] = [
  { name: "Galanet" },
  { name: "Alcaldía de Trujillo" },
  { name: "TODO tv" },
  { name: "Soccer Burguer" },
  { name: "Tetê" },
  { name: "Henry's" },
  { name: "Rizo Café" },
  { name: "La Protectora Café Gourmet" },
  { name: "CTT Turismo" },
];
