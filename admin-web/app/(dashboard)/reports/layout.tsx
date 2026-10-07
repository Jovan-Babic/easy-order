import { ModuleGate } from "@/components/ModuleGate";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="reports">{children}</ModuleGate>;
}
