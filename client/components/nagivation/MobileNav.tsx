import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

//utils
import { isActive } from "@/lib/utils";

//Constants
import { BOTTOM_NAV } from "@/constant";

//co
import { useAuth } from "@/features/auth/hooks/use-auth";

export default function () {
  const { user, isHydrated, isSuperAdmin, isAdminOrAbove, hasAccess } =
    useAuth();
  const pathname = usePathname();

  return (
    <nav
      className="flex h-16 shrink-0 items-center justify-around border-t border-[#e8edf3] bg-white px-2 lg:hidden"
      aria-label="Mobile navigation"
    >
      {BOTTOM_NAV.filter((item) => hasAccess(item.roles ?? [])).map(
        ({ label, href, icon: Icon }) => {
          const active = isActive(href, pathname);
          return (
            <Link
              key={href}
              href={href as string}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-slate-400",
              )}
            >
              <Icon className={cn("size-5", active && "stroke-[2.5px]")} />
              {label}
            </Link>
          );
        },
      )}
    </nav>
  );
}
