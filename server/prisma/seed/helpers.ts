import bcrypt from "bcrypt";

export const hash = (p: string) => bcrypt.hash(p, 10);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export function rng(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
