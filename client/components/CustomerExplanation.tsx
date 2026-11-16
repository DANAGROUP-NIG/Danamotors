export function CustomerExplanation({
  text,
  title = "Additional explanation",
}: {
  text?: string | null;
  title?: string;
}) {
  if (!text) return null;
  return (
    <section className="border-t border-border pt-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 whitespace-pre-wrap text-sm">{text}</p>
    </section>
  );
}
