import { Activity } from "lucide-react";

import PageShell from "../components/common/PageShell";
import PlaceholderPanel from "../components/common/PlaceholderPanel";

export default function SensorHistoryPage() {
  return (
    <PageShell>
      <PlaceholderPanel
        eyebrow="Sensor Archive"
        title="Sensor History"
        description="The route shell is in place for historical reading exploration, range filters, and operational troubleshooting."
        icon={Activity}
      />
    </PageShell>
  );
}
