import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { features } from "../../data";

export default function FeatureGrid() {
  return (
    <section id="features" className="bg-card py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <Badge tone="blue">What you can do</Badge>
          <h2 className="mt-4 text-3xl font-black sm:text-5xl">Car service that feels clear from booking to pickup.</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="transition hover:-translate-y-1 hover:shadow-xl">
              <CardHeader>
                <div className="mb-5 grid size-11 place-items-center rounded-lg bg-secondary text-primary">
                  <feature.icon className="size-5" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{feature.copy}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
