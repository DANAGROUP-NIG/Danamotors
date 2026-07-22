import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
