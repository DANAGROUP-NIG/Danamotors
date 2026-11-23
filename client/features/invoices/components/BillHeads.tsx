const currency = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

type BillHeadsProps = {
  kiaSpareTotal: string;
  nonKiaSpareTotal: string;
  labourTotal: number;
  serviceTotal: number;
  discount: number;
  vatAmount: number;
  standardVat: boolean;
  roundOff: number;
  total: number;
};

export function BillHeads(props: BillHeadsProps) {
  const rows = [
    ["Kia Spare", Number(props.kiaSpareTotal)],
    ["Non-Kia Spare", Number(props.nonKiaSpareTotal)],
    ["Labour", props.labourTotal],
    ["Service charge", props.serviceTotal],
    ["Discount", props.discount === 0 ? 0 : -props.discount],
    [props.standardVat ? "VAT 7.5%" : "VAT", props.vatAmount],
    ["Round off", props.roundOff],
  ] as const;

  return (
    <dl className="ml-auto grid w-full max-w-sm grid-cols-2 gap-x-6 gap-y-2 border-t pt-4 text-sm print:break-inside-avoid">
      {rows.map(([label, amount]) => (
        <div key={label} className="col-span-2 grid grid-cols-subgrid">
          <dt>{label}</dt>
          <dd className="text-right tabular-nums">{currency.format(amount)}</dd>
        </div>
      ))}
      <dt className="border-t pt-2 font-semibold">Total</dt>
      <dd className="border-t pt-2 text-right font-semibold tabular-nums">{currency.format(props.total)}</dd>
    </dl>
  );
}
