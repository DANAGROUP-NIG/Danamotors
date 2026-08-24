import { Activity, Bell, Car, Package, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const trustedLogos = [
  { label: "Dana Motors", icon: Car },
  { label: "Certified Technicians", icon: ShieldCheck },
  { label: "Genuine Parts", icon: Package },
  { label: "Service Tracking", icon: Activity },
  { label: "Pickup Alerts", icon: Bell },
];

export default function TrustedBy() {
  return (
    <section className="border-y border-border bg-card/65 py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Badge tone="blue">Trusted by car owners</Badge>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Built by Dana Group for car owners who want trusted service,
            clear updates, and easier pickup.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {trustedLogos.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-background px-6 py-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-blue-950/5"
            >
              <div className="grid size-11 place-items-center rounded-xl bg-primary/5 text-primary transition-colors duration-300 group-hover:bg-primary/10">
                <Icon className="size-5" />
              </div>
              <p className="text-sm font-black text-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
