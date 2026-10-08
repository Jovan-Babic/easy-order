import { ModuleGate } from "@/components/ModuleGate";

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="stock">{children}</ModuleGate>;
}
