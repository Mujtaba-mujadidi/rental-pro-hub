"use client";

import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Raster basemap (no API key). More reliable than OpenFreeMap vector styles,
 * which can render as a blank canvas when tiles/style fail to load.
 */
function cartoRasterStyle(dark: boolean): StyleSpecification {
  const path = dark ? "dark_all" : "rastertiles/voyager";
  const hosts = ["a", "b", "c", "d"] as const;
  return {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: hosts.map((h) => `https://${h}.basemaps.cartocdn.com/${path}/{z}/{x}/{y}@2x.png`),
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [{ id: "carto", type: "raster", source: "carto" }],
  };
}

type Props = {
  latitude: number;
  longitude: number;
  label: string;
  className?: string;
};

export function TrackerLocationMap({ latitude, longitude, label, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const dark = document.documentElement.classList.contains("dark");
    const map = new MapLibreMap({
      container: el,
      style: cartoRasterStyle(dark),
      center: [longitude, latitude],
      zoom: 14,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const marker = new Marker({ color: "#2563eb" })
      .setLngLat([longitude, latitude])
      .setPopup(new Popup({ offset: 18, closeButton: false }).setText(label))
      .addTo(map);
    markerRef.current = marker;

    const resize = () => map.resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(el);
    // MapLibre often needs a second resize after layout settles in a flex card.
    requestAnimationFrame(() => {
      resize();
      window.setTimeout(resize, 100);
    });

    return () => {
      ro?.disconnect();
      marker.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Init once per mount; position updates handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map created once
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setLngLat([longitude, latitude]);
    map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 14), essential: true });
  }, [latitude, longitude]);

  return <div ref={containerRef} className={className} role="img" aria-label={`Map showing ${label}`} />;
}
