import Link from "next/link";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FinalCTA() {
  return (
    <section className="px-4 pb-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-lg bg-primary px-6 py-14 text-center text-primary-foreground shadow-2xl shadow-blue-500/20">
        <Star className="mx-auto size-8" />
        <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-black sm:text-5xl">
          Give your car a clearer, more reliable service experience.
        </h2>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" variant="secondary" asChild>
            <Link href="/#book">Book Service</Link>
          </Button>
          <Button className="border-white/40 bg-transparent text-white hover:bg-white/10" size="lg" variant="outline" asChild>
            <Link href="/login">Track My Car</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
