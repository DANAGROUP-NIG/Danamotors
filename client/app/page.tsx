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

// Render per request so the page is sent with "no-store". As a static page it went out with
// "Cache-Control: s-maxage=31536000", which Safari kept and kept showing after a deploy.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="landing-bg min-h-screen overflow-hidden pt-20">
      <LandingHeader />
      <Hero />
      <TrustedBy />
      {/* <ProductOverview /> */}
      {/* <FeatureGrid /> */}
      <Workflow />
      <BookingSection />
      <DashboardShowcase />
      <ServicePlans />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
