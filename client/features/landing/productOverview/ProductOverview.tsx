import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const overviewItems = [
  ["Book with confidence", "Send your vehicle details and preferred service date before visiting."],
  ["Approve before repair", "Review inspection findings and estimates before Dana proceeds."],
  ["Track every stage", "See service progress from check-in through repair and pickup."],
];

export default function ProductOverview() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Badge tone="green">For car owners</Badge>
          <h2 className="mt-4 text-3xl font-black sm:text-5xl">A simpler way to care for your car with Dana Group.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {overviewItems.map(([title, copy]) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{copy}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
