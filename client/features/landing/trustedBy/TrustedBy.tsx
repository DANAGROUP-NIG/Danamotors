import { Badge } from "@/components/ui/badge";

const trustedLogos = [
  "Dana Motors",
  "Certified Technicians",
  "Genuine Parts",
  "Service Tracking",
  "Pickup Alerts",
];

export default function TrustedBy() {
  return (
    <section className="border-y border-border bg-card/65 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-bold uppercase text-muted-foreground">
          Built by Dana Group for car owners who want trusted service, clear updates, and easier pickup
        </p>
        <div className="grid grid-cols-2 gap-3 text-center text-sm font-black text-muted-foreground sm:grid-cols-5">
          {trustedLogos.map((logo) => (
            <div key={logo} className="rounded-lg border border-border bg-background px-4 py-4">
              {logo}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
