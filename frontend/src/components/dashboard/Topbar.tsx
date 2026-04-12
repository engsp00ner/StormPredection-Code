import { ChevronDown, MoonStar, Search, SunMedium } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Switch } from "../ui/switch";

const topbarLinks = [
  { label: "Dashboard", href: "/" },
  { label: "Alerts", href: "/alerts/" },
  { label: "WhatsApp", href: "/whatsapp/" },
  { label: "Recipients", href: "/whatsapp/recipients/" },
  { label: "Settings", href: "/settings/" },
];

export default function Topbar() {
  const location = useLocation();
  const isDashboard = location.pathname === "/";

  return (
    <header className="space-y-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm text-[#8d8d8d]">Hi, </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-white sm:text-4xl">
            {isDashboard ? "Good Morning" : "Operations Control"}
          </h1>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="glass-ring flex min-w-[260px] items-center gap-3 rounded-full border border-white/8 bg-[#1d1d1d] px-4 py-3 text-sm text-[#8d8d8d]">
            <Search className="h-4 w-4 text-[#8d8d8d]" />
            <input
              className="w-full bg-transparent text-white outline-none placeholder:text-[#727272]"
              placeholder="Search stations, alerts, metrics..."
            />
          </label>

          <div className="glass-ring flex items-center gap-3 rounded-full border border-white/8 bg-[#1d1d1d] px-4 py-3">
            <MoonStar className="h-4 w-4 text-[#8d8d8d]" />
            <Switch checked />
            <SunMedium className="h-4 w-4 text-sky-300" />
          </div>

          <button className="glass-ring card-hover flex items-center gap-3 rounded-full border border-white/8 bg-[#1d1d1d] px-3 py-2 text-left">
            <Avatar>
              <AvatarFallback>KA</AvatarFallback>
            </Avatar>
            <div className="hidden pr-1 sm:block">
              <p className="text-sm font-semibold text-white"></p>
              <p className="text-xs text-[#8d8d8d]">Ops Manager</p>
            </div>
            <ChevronDown className="h-4 w-4 text-[#8d8d8d]" />
          </button>
        </div>
      </div>

      <nav className="glass-ring flex flex-wrap items-center gap-2 rounded-[24px] border border-white/8 bg-[#181818]/90 p-2">
        {topbarLinks.map((link) => (
          <NavLink
            key={link.href}
            to={link.href}
            className={({ isActive }) =>
              cn(
                "rounded-[18px] px-4 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-[#8d8d8d] hover:bg-white/6 hover:text-white",
              )
            }
            end={link.href === "/"}>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
