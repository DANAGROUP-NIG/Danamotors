import { Gauge } from "lucide-react";

export function HeaderLogo() {
  return (
    <a className="flex items-center gap-3" href="/">
      <img src="/logo.webp" alt="Dana Motor DriveCare Logo" className="w-20 h-6 font-bold" />
    </a>
  );
}
