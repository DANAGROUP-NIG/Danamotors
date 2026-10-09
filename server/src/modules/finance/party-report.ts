import { Prisma } from '@prisma/client';
import { BadRequestError } from '../../shared/errors/appError';
import { ageLimitsSchema } from './party-report.validation';
export function reportStart(date:string){return new Date(date+'T00:00:00+01:00');}
export function reportEnd(date: string) { const end=reportStart(date);end.setUTCDate(end.getUTCDate()+1);return end; }
export function daysOld(date: Date, asOn: Date) {date=new Date(date.getTime()+3600000);asOn=new Date(asOn.getTime()+3600000);return Math.max(0,Math.floor((Date.UTC(asOn.getUTCFullYear(),asOn.getUTCMonth(),asOn.getUTCDate())-Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()))/86400000)); }
export function ageBucket(age: number,limits: number[]) { ageLimitsSchema.parse(limits);if(!Number.isInteger(age)||age<0)throw new BadRequestError('Age must be a nonnegative day count');const i=limits.findIndex(n=>age<=n);return i<0?limits.length:i; }
export function asOnBalance(amount: Prisma.Decimal.Value,documentDate: Date,adjustments:Array<{amount:Prisma.Decimal.Value;date:Date;reversedAt?:Date|null}>,asOn:Date) {
 if(documentDate>asOn)return new Prisma.Decimal(0);
 return adjustments.filter(a=>a.date<=asOn&&(!a.reversedAt||a.reversedAt>asOn)).reduce((balance,a)=>balance.minus(a.amount),new Prisma.Decimal(amount)).toDecimalPlaces(2);
}
export function runningBalances(opening: Prisma.Decimal.Value,rows:Array<{debit:Prisma.Decimal.Value;credit:Prisma.Decimal.Value}>) {let balance=new Prisma.Decimal(opening);return rows.map(row=>{balance=balance.plus(row.debit).minus(row.credit).toDecimalPlaces(2);return balance;});}
