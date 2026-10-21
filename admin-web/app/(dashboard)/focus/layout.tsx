import { ModuleGate } from "@/components/ModuleGate";

export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="focus">{children}</ModuleGate>;
}
