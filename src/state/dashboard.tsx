import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { FULL_RANGE, type MonthRange } from "@/lib/analytics";

export interface DrawerColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: string;
  format?: (value: unknown, row: Record<string, unknown>) => ReactNode;
}

export interface DrawerPayload {
  title: string;
  subtitle?: string;
  headline?: { label: string; value: string }[];
  columns: DrawerColumn[];
  rows: Record<string, unknown>[];
  footnote?: string;
}

interface DashboardCtx {
  range: MonthRange;
  setRange: (r: MonthRange) => void;
  drawer: DrawerPayload | null;
  openDrawer: (p: DrawerPayload) => void;
  closeDrawer: () => void;
}

const Ctx = createContext<DashboardCtx | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<MonthRange>(FULL_RANGE);
  const [drawer, setDrawer] = useState<DrawerPayload | null>(null);

  const openDrawer = useCallback((p: DrawerPayload) => setDrawer(p), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);

  const value = useMemo(
    () => ({ range, setRange, drawer, openDrawer, closeDrawer }),
    [range, drawer, openDrawer, closeDrawer],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboard(): DashboardCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
}
