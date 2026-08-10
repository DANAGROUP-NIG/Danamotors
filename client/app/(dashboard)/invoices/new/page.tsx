import { InvoiceCreateForm } from "@/features/invoices/components/InvoiceCreateForm";
import { PageHeader } from "@/components/headers/page-header";

export const metadata = { title: "New Invoice - Dana Motors" };

export default function NewInvoicePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 lg:p-6">
      <a href="/invoices" className="text-sm text-primary hover:underline">
        &larr; Back to invoices
      </a>
      <PageHeader
        title="New invoice"
        description="Create a customer invoice, optionally linked to a job card."
      />
      <div className="rounded-xl border border-border bg-card p-5">
        <InvoiceCreateForm />
      </div>
    </div>
  );
}
