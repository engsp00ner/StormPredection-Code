import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

interface SectionCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  contentClassName?: string;
  hoverable?: boolean;
}

export default function SectionCard({
  children,
  className,
  title,
  subtitle,
  action,
  contentClassName,
  hoverable = true,
}: SectionCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={cn(
        "glass-ring rounded-[28px] border border-white/8 bg-[#1e1e1e]/95",
        hoverable && "card-hover",
        className,
      )}
    >
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-white/6 px-6 pb-4 pt-5 sm:px-7">
          <div>
            {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
            {subtitle && (
              <p className="mt-1 text-sm text-[#b9b9b9]">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={cn("p-6 sm:p-7", contentClassName)}>{children}</div>
    </motion.section>
  );
}
