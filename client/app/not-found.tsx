export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground px-4">
      <div className="max-w-xl text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Page not found</p>
        <h1 className="mt-6 text-4xl font-bold">404 — This page does not exist</h1>
        <p className="mt-4 text-base text-muted-foreground">
          The route you requested could not be found. Please check the URL or return to the home page.
        </p>
      </div>
    </main>
  );
}
