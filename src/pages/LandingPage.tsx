import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { Hero } from "../components/Hero";
import { RegistrationSection } from "../components/RegistrationSection";
import { ScrollJourney } from "../components/ScrollJourney";
import { SponsorsMarquee } from "../components/SponsorsMarquee";

export function LandingPage() {
  return (
    <div className="min-h-svh bg-surface">
      <Header />
      <main>
        <Hero />
        <ScrollJourney />
        <SponsorsMarquee />
        <RegistrationSection />
      </main>
      <Footer />
    </div>
  );
}
