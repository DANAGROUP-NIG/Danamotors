import type { ReactNode } from "react";
// import { Check, Clock, CircleCheck, CircleAlert, Wrench } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
type PrintData = {
  estimate: {
    version: number;
    estimateNumber: string | null;
    estimateDate: string;
    currency: string;
    total: number;
    supersededBy: number | null;
    signatureState: string | null;
    lines: {
      type: string;
      code: string;
      description: string;
      quantity: number;
      rate: number;
      amount: number;
    }[];
    signature: {
      imageReference: string;
      signerName: string;
      relationship: string | null;
      signedAt: string;
      estimateVersion: number;
      totalSigned: number;
    } | null;
  };
  company: { name: string; address?: string; phone?: string };
  branch: { name: string; address?: string; phone?: string };
  customer: { name: string; address: string; phone: string | null } | null;
  vehicle: {
    registration: string | null;
    vin: string;
    make: string;
    model: string;
    variant: string | null;
    mileage: number | null;
  } | null;
  job: {
    number: string;
    date: string;
    serviceType: string;
    complaints: string[];
  };
  terms: string[];
  footer: string | null;
  printedAt: string;
};
const date = (value: string) =>
  new Date(value).toLocaleString("en-NG", { timeZone: "Africa/Lagos" });
export default function EstimatePrintPage() {
  const { id, estimateId } = useParams<{ id: string; estimateId: string }>();
  const { hasPermission } = useAuth();
  const allowed = hasPermission("estimate:print");
  const { data, isPending, isError } = useQuery({
    queryKey: ["estimate-print", id, estimateId],
    queryFn: () =>
      apiGet<PrintData>(
        `/service/job-cards/${id}/estimates/${estimateId}/print`,
      ),
    enabled: allowed,
  });
  if (!allowed)
    return <p role="alert">You do not have permission to print estimates.</p>;
  if (isPending) return <LoadingSkeleton label="Loading estimate" />;
  if (isError || !data)
    return <p role="alert">Estimate could not be loaded.</p>;
  const { estimate, company, branch, customer, vehicle, job } = data;
  const money = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: estimate.currency,
    }).format(value);
  return (
    <article className="estimate-print mx-auto max-w-4xl space-y-5 bg-white p-6 text-black print:p-0">
      <style>{`@page {size:A4 portrait;margin:15mm 12mm 18mm;@bottom-left {content:"Printed ${date(data.printedAt).replaceAll('"', "")} · Africa/Lagos";font-size:8pt;}@bottom-right {content:"Page " counter(page) " of " counter(pages);font-size:8pt;}} @media print {body {background:white;}body * {visibility:hidden;} .estimate-print,.estimate-print * {visibility:visible;} .estimate-print {position:absolute;left:0;top:0;width:100%;max-width:none;font-size:10pt;} .estimate-print .print-controls {display:none;} .estimate-print tr,.signature-block {break-inside:avoid;} .estimate-print thead {display:table-header-group;}}`}</style>
      <div className="print-controls flex gap-3">
        <Button onClick={() => window.print()}>Print estimate</Button>
        <a className="underline" href={`/job-cards/${id}`}>
          Back to job card
        </a>
      </div>
      <header className="border-b pb-4">
        <h1 className="text-2xl font-bold">{company.name}</h1>
        <p>
          {company.address} {company.phone}
        </p>
        <h2 className="font-semibold">{branch.name}</h2>
        <p>
          {branch.address} {branch.phone}
        </p>
      </header>
      <div>
        <h2 className="text-xl font-bold">
          Job estimate · Revision {estimate.version}
        </h2>
        <p>
          {estimate.estimateNumber ?? "Legacy estimate"} ·{" "}
          {date(estimate.estimateDate)}
        </p>
        <strong>Not a bill</strong>
        {estimate.supersededBy && (
          <p className="font-bold">
            Superseded by revision {estimate.supersededBy}
          </p>
        )}
      </div>
      <section className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold">Customer</h3>
          <p>{customer?.name}</p>
          <p>{customer?.address}</p>
          <p>{customer?.phone}</p>
        </div>
        <div>
          <h3 className="font-semibold">Vehicle</h3>
          <p>
            {vehicle?.registration} · {vehicle?.make} {vehicle?.model}{" "}
            {vehicle?.variant}
          </p>
          <p>VIN: {vehicle?.vin}</p>
          <p>Mileage: {vehicle?.mileage ?? "—"}</p>
        </div>
      </section>
      <section>
        <h3 className="font-semibold">Job {job.number}</h3>
        <p>
          {date(job.date)} · {job.serviceType}
        </p>
        <h4>Customer complaints</h4>
        <ul>
          {job.complaints.map((complaint, index) => (
            <li key={index}>{complaint}</li>
          ))}
        </ul>
      </section>
      {[
        ["PART", "Parts"],
        ["LABOUR", "Labour"],
        ["SERVICE", "Service charge"],
      ].map(([type, title]) => (
        <section key={type}>
          <h3 className="font-semibold">{title}</h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th>Code / part number</th>
                <th>Description</th>
                <th>Quantity / hours</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lines
                .filter((line) => line.type === type)
                .map((line, index) => (
                  <tr className="border-b" key={index}>
                    <td>{line.code}</td>
                    <td>{line.description}</td>
                    <td>{line.quantity}</td>
                    <td>{money(line.rate)}</td>
                    <td>{money(line.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="text-right text-lg font-bold">
        Total: {money(estimate.total)}
      </p>
      {data.terms.length > 0 && (
        <section>
          <h3 className="font-semibold">Terms</h3>
          <ol className="list-inside list-decimal">
            {data.terms.map((term, index) => (
              <li key={index}>{term}</li>
            ))}
          </ol>
        </section>
      )}
      <section className="signature-block border-t pt-4">
        {estimate.signature ? (
          <>
            <p>
              {estimate.signatureState === "invalid"
                ? "INVALID SIGNATURE · obtain a new signed revision"
                : "Customer signature"}
            </p>
            <Image
              src={estimate.signature.imageReference}
              alt="Captured customer signature"
              width={300}
              height={100}
            />
            <p>
              Signed by {estimate.signature.signerName}
              {estimate.signature.relationship
                ? ` for ${customer?.name} (${estimate.signature.relationship})`
                : ""}
            </p>
            <p>{date(estimate.signature.signedAt)} · Africa/Lagos</p>
            <p>
              Revision {estimate.signature.estimateVersion} · Total signed{" "}
              {money(estimate.signature.totalSigned)}
            </p>
          </>
        ) : (
          <>
            <p>Customer signature: ____________________________</p>
            <p>Date: ____________________________</p>
            {estimate.signatureState === "legacy" && (
              <p>Approved before signatures were introduced</p>
            )}
            {estimate.signatureState === "override" && (
              <p>Approval recorded by Admin override</p>
            )}
          </>
        )}
      </section>
      <footer className="border-t pt-3 text-sm">
        <p>{data.footer}</p>
        <p>Printed {date(data.printedAt)} · Africa/Lagos</p>
      </footer>
    </article>
  );
}
