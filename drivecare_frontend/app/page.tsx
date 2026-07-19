import {
  Header,
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

export default function Home() {
  return (
    <main className="landing-bg min-h-screen overflow-hidden pt-20">
      <Header />
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
