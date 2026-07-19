import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const faqItems = [
  [
    "Is DriveCare for car owners?",
    "Yes. DriveCare helps car users book service, follow repair progress, approve estimates, and know when the car is ready.",
  ],
  [
    "Who handles the administration and service management?",
    "Dana Group manages the internal operations, technician coordination, inspections, parts, quality checks, and service records.",
  ],
  [
    "Can I approve repairs before work starts?",
    "Yes. The service flow is designed so customers can review findings and estimates before major repair work proceeds.",
  ],
];

export default function FAQ() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="text-center">
        <Badge tone="neutral">FAQ</Badge>
        <h2 className="mt-4 text-3xl font-black sm:text-5xl">Questions car owners ask first.</h2>
      </div>
      <div className="mt-10 grid gap-3">
        {faqItems.map(([question, answer]) => (
          <Card key={question}>
            <CardHeader>
              <CardTitle>{question}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">{answer}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
