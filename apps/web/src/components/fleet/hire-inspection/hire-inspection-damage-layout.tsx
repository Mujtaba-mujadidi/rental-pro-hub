"use client";

import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";

const DIAGRAM_MEASURE_SELECTOR = "[data-hire-inspection-diagram-measure]";

type HireInspectionDamageLayoutProps = {
  diagram: ReactNode;
  list: ReactNode;
};

export function HireInspectionDamageLayout({ diagram, list }: HireInspectionDamageLayoutProps) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const [diagramHeight, setDiagramHeight] = useState<number | null>(null);
  const [listOffset, setListOffset] = useState(0);

  useLayoutEffect(() => {
    const column = diagramRef.current;
    if (!column) return;

    const syncLayout = () => {
      const measure = column.querySelector<HTMLElement>(DIAGRAM_MEASURE_SELECTOR);
      if (!measure) {
        setDiagramHeight(null);
        setListOffset(0);
        return;
      }

      const columnRect = column.getBoundingClientRect();
      const measureRect = measure.getBoundingClientRect();
      setDiagramHeight(Math.round(measureRect.height));
      setListOffset(Math.max(0, Math.round(measureRect.top - columnRect.top)));
    };

    syncLayout();

    const observer = new ResizeObserver(syncLayout);
    observer.observe(column);
    const measure = column.querySelector<HTMLElement>(DIAGRAM_MEASURE_SELECTOR);
    if (measure) observer.observe(measure);

    return () => observer.disconnect();
  }, []);

  const listStyle =
    diagramHeight != null
      ? ({
          "--hire-ws-damage-diagram-h": `${diagramHeight}px`,
          "--hire-ws-damage-list-offset": `${listOffset}px`,
        } as CSSProperties)
      : undefined;

  return (
    <div className="hire-ws-inspection-damage-layout">
      <div ref={diagramRef} className="hire-ws-inspection-damage-layout-diagram min-w-0">
        {diagram}
      </div>
      <div className="hire-ws-inspection-damage-layout-list min-w-0" style={listStyle}>
        {list}
      </div>
    </div>
  );
}
