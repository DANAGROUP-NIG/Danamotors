import {
  Hero,
  TrustedBy,
  ProductOverview,
  FeatureGrid,
  Workflow,
  DashboardShowcase,
  ServicePlans,
  BookingSection,
  FAQ,
  FinalCTA,
  Footer,
} from "../index";

import LandingHeader from "@/components/headers/LandingHeader";

export default function Home() {
  return (
    <main className="landing-bg min-h-screen overflow-hidden pt-20">
      <LandingHeader />
      <Hero />
      <TrustedBy />
      <ProductOverview />
      <FeatureGrid />
      <Workflow />
      <DashboardShowcase />
      <ServicePlans />
      <BookingSection />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
