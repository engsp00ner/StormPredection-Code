import { CircleHelp, Menu } from "lucide-react";
import { NavLink } from "react-router-dom";

import { sidebarItems } from "../../data/mockDashboardData";
import { cn } from "../../lib/utils";

export default function Sidebar() {
  return (
    <aside className="glass-ring flex h-auto w-full flex-row items-center justify-between rounded-[30px] border border-white/8 bg-[#191919] p-4 lg:h-[calc(100vh-48px)] lg:w-[92px] lg:flex-col lg:py-6">
      <div className="flex items-center gap-3 lg:flex-col">
        <button className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10">
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 lg:mt-8 lg:flex-col">
          {sidebarItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.id}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-300",
                    isActive
                      ? "bg-gradient-to-b from-sky-400/24 to-cyan-300/10 text-white shadow-[0_12px_28px_rgba(14,165,233,0.16)] ring-1 ring-sky-300/20"
                      : "text-[#818181] hover:bg-white/6 hover:text-white",
                  )
                }
              >
                <Icon className="h-5 w-5" />
              </NavLink>
            );
          })}
        </div>
      </div>

      <a
        href="https://web.whatsapp.com"
        target="_blank"
        rel="noreferrer"
        className="flex h-12 w-12 items-center justify-center rounded-2xl text-[#7f7f7f] transition hover:bg-white/6 hover:text-white"
      >
        <CircleHelp className="h-5 w-5" />
      </a>
    </aside>
  );
}
