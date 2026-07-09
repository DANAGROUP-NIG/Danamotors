import "react-day-picker/style.css";
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
    <main className="min-h-screen overflow-hidden">
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
