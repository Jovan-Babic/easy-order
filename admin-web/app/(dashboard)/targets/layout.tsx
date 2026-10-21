import { ModuleGate } from "@/components/ModuleGate";

export default function TargetsLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="targets">{children}</ModuleGate>;
}
