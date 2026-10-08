"use client";

import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";

// Abas acessíveis (WAI-ARIA Tabs): role=tablist/tab/tabpanel, aria-selected, aria-controls, tabindex
// "roving" e teclado ← → Home End (ativação automática; abas desabilitadas são puladas).
// Uso: <Tabs label="Etapas" items={[...]} value={v} onValueChange={setV}><TabPanel value="a">…</TabPanel></Tabs>
export type TabItem = { value: string; label: ReactNode; disabled?: boolean };
type TabsVariant = "underline" | "segmented";

type TabsContextValue = { baseId: string; value: string };
const TabsContext = createContext<TabsContextValue | null>(null);
const tabId = (baseId: string, value: string) => `${baseId}-tab-${value}`;
const panelId = (baseId: string, value: string) => `${baseId}-panel-${value}`;

export type TabsProps = {
  /** Nome acessível do grupo (aria-label do tablist). */
  label: string;
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  variant?: TabsVariant;
  children?: ReactNode;
  className?: string;
};

const tabClasses: Record<TabsVariant, { list: string; tab: string }> = {
  underline: {
    list: "flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border",
    tab: "-mb-px inline-flex h-10 shrink-0 items-center whitespace-nowrap border-b-2 border-transparent px-3 text-button text-foreground-muted hover:text-foreground aria-selected:border-primary aria-selected:text-primary",
  },
  segmented: {
    list: "inline-flex gap-1 rounded-control border border-border bg-surface-muted p-1",
    tab: "inline-flex h-8 items-center whitespace-nowrap rounded-md px-3 text-button text-foreground-muted hover:text-foreground aria-selected:bg-surface aria-selected:text-foreground aria-selected:shadow-elevation-sm",
  },
};

export function Tabs({ label, items, value, onValueChange, variant = "underline", children, className }: TabsProps) {
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = items.filter((item) => !item.disabled);

  function focusAndSelect(next: TabItem | undefined) {
    if (!next) return;
    onValueChange(next.value);
    refs.current[next.value]?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = enabled.findIndex((item) => item.value === value);
    const keys: Record<string, () => TabItem | undefined> = {
      ArrowRight: () => enabled[(index + 1) % enabled.length],
      ArrowLeft: () => enabled[(index - 1 + enabled.length) % enabled.length],
      Home: () => enabled[0],
      End: () => enabled[enabled.length - 1],
    };
    const resolve = keys[event.key];
    if (!resolve || !enabled.length) return;
    event.preventDefault();
    focusAndSelect(resolve());
  }

  return (
    <TabsContext.Provider value={{ baseId, value }}>
      <div className={className}>
        <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={tabClasses[variant].list}>
          {items.map((item) => {
            const selected = item.value === value;
            return (
              <button
                key={item.value}
                ref={(node) => { refs.current[item.value] = node; }}
                type="button"
                role="tab"
                id={tabId(baseId, item.value)}
                aria-selected={selected}
                aria-controls={panelId(baseId, item.value)}
                tabIndex={selected ? 0 : -1}
                disabled={item.disabled}
                onClick={() => onValueChange(item.value)}
                className={clsx("cursor-pointer transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none", tabClasses[variant].tab)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabPanel deve ficar dentro de <Tabs>.");
  if (context.value !== value) return null;
  return (
    <div role="tabpanel" id={panelId(context.baseId, value)} aria-labelledby={tabId(context.baseId, value)} tabIndex={0} className={clsx("focus-visible:outline-offset-4", className)}>
      {children}
    </div>
  );
}
