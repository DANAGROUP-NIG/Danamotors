import { Prisma } from "@prisma/client";
import { BadRequestError } from "../../shared/errors/appError";
import { money } from "../finance/money";

/** Suggested amount only; work-start eligibility is independent of this percentage. */
export function upfrontAmount(
  amount: number,
  percent: Prisma.Decimal | number,
) {
  const rate = new Prisma.Decimal(percent);
  if (!rate.isFinite() || rate.lt(0) || rate.gt(100))
    throw new BadRequestError("Upfront percentage must be between 0 and 100");
  return money(new Prisma.Decimal(amount).times(rate).div(100).toNumber());
}
