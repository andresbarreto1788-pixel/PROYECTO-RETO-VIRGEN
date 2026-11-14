import { Footer } from "../components/Footer";
import { GalanetAdModal } from "../components/GalanetAdModal";
import { Header } from "../components/Header";
import { Hero } from "../components/Hero";
import { LodgingSection } from "../components/LodgingSection";
import { RegistrationSection } from "../components/RegistrationSection";
import { ScrollJourney } from "../components/ScrollJourney";
import { SponsorsMarquee } from "../components/SponsorsMarquee";
import { WhatsAppFloatingButton } from "../components/WhatsAppFloatingButton";

export function LandingPage() {
  return (
    <div className="min-h-svh bg-surface">
      <Header />
      <main>
        <Hero />
        <ScrollJourney />
        <LodgingSection />
        <SponsorsMarquee />
        <RegistrationSection />
      </main>
      <Footer />
      <WhatsAppFloatingButton />
      <GalanetAdModal />
    </div>
  );
}
