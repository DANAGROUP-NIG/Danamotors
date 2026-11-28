import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground px-4">
      <div className="max-w-xl text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Page not found</p>
        <h1 className="mt-6 text-4xl font-bold">This page does not exist</h1>
        <p className="mt-4 text-base text-muted-foreground">
          Check the address, or go back to the dashboard and use the menu.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Go to the dashboard
        </Link>
      </div>
    </main>
  );
}
