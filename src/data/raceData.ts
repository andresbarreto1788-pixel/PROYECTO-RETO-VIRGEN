import type { ElevationPoint, KitItem, RacePhase, RouteModality, Sponsor } from "../types/race";

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
    priceUsd: 25,
  },
  {
    id: "reto-22k",
    label: "Reto Medio 22K",
    distanceKm: 22,
    startPoint: "Parque Los Ilustres",
    finishPoint: "Monumento Virgen de la Paz (46,72 m)",
    description: "Una salida más corta hacia la misma cumbre. Paseo / cicloturismo: cada quien a su propio ritmo.",
    priceUsd: 25,
  },
];

export const PAYMENT_INFO = {
  banco: "Banco Provincial",
  bancoCodigo: "0108",
  cuenta: "0108-0377-20-0100049415",
  pagoMovil: {
    banco: "0108 (Banco Provincial)",
    cedula: "18924508",
    telefono: "0414-0746270",
  },
};

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
    description: "Diseño con pinos andinos y el logo oficial de la Virgen. Disponible en tallas S a XXL.",
    image: "/images/jersey-front.jpeg",
  },
];

export const JERSEY_IMAGES = {
  front: "/images/jersey-front.jpeg",
  back: "/images/jersey-back.jpeg",
};

export const JERSEY_SIZES = ["S", "M", "L", "XL", "XXL"] as const;

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
