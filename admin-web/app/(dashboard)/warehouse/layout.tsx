import { ModuleGate } from "@/components/ModuleGate";

export default function WarehouseLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="warehouse">{children}</ModuleGate>;
}
