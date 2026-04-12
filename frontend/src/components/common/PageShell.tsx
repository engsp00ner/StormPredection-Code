import type { ReactNode } from "react";

import Sidebar from "../layout/Sidebar";
import Topbar from "../layout/Topbar";

interface PageShellProps {
  children: ReactNode;
}

export default function PageShell({ children }: PageShellProps) {
  return (
    <main className="min-h-screen p-4 text-white lg:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 lg:flex-row">
        <Sidebar />

        <div className="flex-1 space-y-6">
          <Topbar />
          {children}
        </div>
      </div>
    </main>
  );
}
