// Source column names were verified from the supplied related cohort.
// Does not interpret cashinv I/Z or category A/B/C.
const {Prisma}=require('@prisma/client');
const D=Prisma.Decimal;
const n=(r,k)=>{const v=r[k]??0;if(!Number.isFinite(Number(v)))throw Error('Invalid source amount: '+k);return new D(v);};
const money=v=>new D(v).toDecimalPlaces(2).toNumber();
const sum=(rows,k)=>rows.reduce((s,r)=>s.plus(n(r,k)),new D(0));
function legacyTaxSnapshot(bill,taxes,job){
 const taxable=taxes.filter(r=>n(r,'taxpercentage').gt(0)||n(r,'taxamount').gt(0));
 const nonTaxable=taxes.filter(r=>!taxable.includes(r));
 const other=rows=>['entrytax','othercharge1','othercharge2','othercharge3','othercharge4','othercharge5'].reduce((s,k)=>s.plus(sum(rows,k)),new D(0));
 const government=job.GovtVehicle;
 if(typeof government!=='boolean')throw Error('Government split requires an explicit source boolean');
 // Legacy discountamt is a percentage; DiscountAmount is the stored money amount.
 // A zero tax rate is only grouped under the combined tax-paid/non-taxable
 // heading; it does not assert that the underlying part is VAT-exempt.
 const labour=money(n(bill,'ServiceCharge').plus(n(bill,'InternalLabourAmount')).times(new D(1).minus(n(bill,'labordiscount').div(100))).plus(n(bill,'ExternalLabourAmount').times(new D(1).minus(n(bill,'externallabdiscount').div(100)))));
 const taxableSubtotal=money(sum(taxable,'taxableamount').plus(sum(taxable,'taxamount')).plus(sum(taxable,'surcharge')).plus(other(taxable)));
 const nonTaxableSubtotal=money(sum(nonTaxable,'saleamount').minus(sum(nonTaxable,'DiscountAmount')).plus(sum(nonTaxable,'handlingcharge')).plus(other(nonTaxable)));
 const variance=money(new D(taxableSubtotal).plus(nonTaxableSubtotal).plus(labour).plus(n(bill,'ServTaxAmt')).plus(n(bill,'RoundOff')).minus(n(bill,'wct')).minus(n(bill,'billamount')));
 // The supplied cohort reconciles within one kobo from source rounding. Reject
 // a different legacy convention rather than silently populating wrong fields.
 if(Math.abs(variance)>0.01)throw Error('Source breakdown does not reconcile within one kobo');
 return {version:1,source:'LEGACY',...(bill.bill!=null?{documentNumber:String(bill.bill).trim()}:{}),sourceRoundingDifference:variance,values:{
  taxableSpares:money(sum(taxable,'saleamount')),taxableDiscount:money(sum(taxable,'DiscountAmount')),
  taxableHandlingCharge:money(sum(taxable,'handlingcharge')),taxableAmount:money(sum(taxable,'taxableamount')),
  upstGovernment:government?money(sum(taxable,'taxamount')):0,upstNonGovernment:government?0:money(sum(taxable,'taxamount')),
  surchargeGovernment:government?money(sum(taxable,'surcharge')):0,surchargeNonGovernment:government?0:money(sum(taxable,'surcharge')),
  taxableOtherCharges:money(other(taxable)),taxableSubtotal,
  nonTaxableTotal:money(sum(nonTaxable,'saleamount')),nonTaxableDiscount:money(sum(nonTaxable,'DiscountAmount')),
  nonTaxableHandlingCharge:money(sum(nonTaxable,'handlingcharge')),nonTaxableOtherCharges:money(other(nonTaxable)),nonTaxableSubtotal,
  labourAmount:labour,labourVat:money(n(bill,'ServTaxAmt')),wctAmount:money(n(bill,'wct')),roundOff:money(n(bill,'RoundOff')),netTotal:money(n(bill,'billamount')),
 }};
}
module.exports={legacyTaxSnapshot};
