import { ReactNode } from "react";

export default function Container({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-row items-center justify-center">{children}</div>
  );
}
