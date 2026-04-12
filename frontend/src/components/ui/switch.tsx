import type { ComponentPropsWithoutRef } from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "../../lib/utils";

function Switch({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-white/10 bg-white/8 transition-colors data-[state=checked]:bg-sky-500/80 data-[state=unchecked]:bg-white/10",
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-1"
      />
    </SwitchPrimitives.Root>
  );
}

export { Switch };
