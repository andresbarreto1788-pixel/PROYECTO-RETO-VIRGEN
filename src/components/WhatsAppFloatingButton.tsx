import { MessageCircle } from "lucide-react";
import { EVENT } from "../data/raceData";

export function WhatsAppFloatingButton() {
  return (
    <a
      href={`https://wa.me/${EVENT.whatsappDigits}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/30 transition-transform hover:scale-105"
    >
      <MessageCircle size={28} strokeWidth={2} />
    </a>
  );
}
