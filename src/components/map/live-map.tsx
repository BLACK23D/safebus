'use client';

/**
 * LiveMap — the shared route map used by the parent tracker, the driver trip
 * console, the admin fleet view and the role-aware route detail page.
 *
 * Two rendering paths:
 *  1. `apiKey` non-empty → Google Maps JS API (script loaded once via a
 *     module-level promise cache; classic markers; bus marker pans with heading).
 *  2. `apiKey` empty (sandbox default — contract §12 returns provider "none")
 *     → a self-contained schematic SVG fallback fed by the exact same REAL data
 *     (contract GeoJSON stops + live Socket.IO bus position). No mock data.
 *
 * Frozen interface (worklog Task 1): stops are `{ id, name, sequence?,
 * location: { coordinates: [lng, lat] } }` (GeoJSON order), bus is
 * `{ lat, lng, heading? }`. `height` accepts a Tailwind height class (spec) or
 * a px number (legacy callers pass 320/380 — both are supported).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type MapStop = {
  id: string;
  name: string;
  sequence?: number;
  location: { coordinates: [number, number] }; // GeoJSON [lng, lat]
};

export type BusPosition = { lat: number; lng: number; heading?: number } | null;

export type LiveMapProps = {
  apiKey: string;
  center?: { lat: number; lng: number };
  stops?: MapStop[];
  bus?: BusPosition;
  arrivalStopId?: string | null;
  className?: string;
  /** Tailwind height class (e.g. 'h-72'), or a px number. Default 'h-72'. */
  height?: string | number;
  ariaLabel?: string;
};

/* ------------------------------------------------------------------ */
/* Google Maps JS API loader (module-level promise cache, load once).  */
/* ------------------------------------------------------------------ */

type GMap = {
  panTo: (p: { lat: number; lng: number }) => void;
  fitBounds: (b: unknown, pad?: number) => void;
  setCenter: (p: { lat: number; lng: number }) => void;
  setZoom: (z: number) => void;
};
type GMarker = {
  setPosition: (p: { lat: number; lng: number }) => void;
  setIcon: (i: unknown) => void;
  setMap: (m: unknown) => void;
};
type GoogleMapsGlobal = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
    Marker: new (opts: Record<string, unknown>) => GMarker;
    LatLngBounds: new () => { extend: (p: unknown) => void; isEmpty: () => boolean };
    Point: new (x: number, y: number) => unknown;
  };
};

let gmapsPromise: Promise<GoogleMapsGlobal> | null = null;

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsGlobal> {
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise<GoogleMapsGlobal>((resolve, reject) => {
    const existing = (window as unknown as { google?: GoogleMapsGlobal }).google;
    if (existing?.maps) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=marker`;
    script.async = true;
    script.onload = () => {
      const g = (window as unknown as { google?: GoogleMapsGlobal }).google;
      if (g?.maps) {
        resolve(g);
      } else {
        gmapsPromise = null;
        reject(new Error('Google Maps loaded without a maps namespace'));
      }
    };
    script.onerror = () => {
      gmapsPromise = null;
      reject(new Error('Google Maps script failed to load'));
    };
    document.head.appendChild(script);
  });
  return gmapsPromise;
}

function getGoogle(): GoogleMapsGlobal | null {
  return (window as unknown as { google?: GoogleMapsGlobal }).google ?? null;
}

/* ------------------------------------------------------------------ */
/* Marker icons (blue numbered stop pin with shadow, rotating bus pin) */
/* ------------------------------------------------------------------ */

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function stopPinUrl(number: number, highlight: boolean): string {
  const fill = highlight ? '#10b981' : '#1976d2';
  const stroke = highlight ? '#047857' : '#0d47a1';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46">` +
    `<defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="rgba(15,23,42,0.35)"/></filter></defs>` +
    `<g filter="url(#s)"><path d="M17 45 C17 45 32 27.5 32 16 A15 15 0 1 0 2 16 C2 27.5 17 45 17 45 Z" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<circle cx="17" cy="16" r="11.5" fill="rgba(255,255,255,0.22)"/></g>` +
    `<text x="17" y="21.5" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" ` +
    `font-weight="bold" fill="#ffffff">${number}</text></svg>`;
  return svgDataUrl(svg);
}

function busPinUrl(heading?: number): string {
  const h = typeof heading === 'number' && Number.isFinite(heading) ? heading : 0;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<defs><filter id="s" x="-40%" y="-40%" width="180%" height="180%">` +
    `<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(15,23,42,0.4)"/></filter></defs>` +
    `<g transform="rotate(${h} 20 20)" filter="url(#s)">` +
    `<circle cx="20" cy="20" r="14.5" fill="#1976d2" stroke="#ffffff" stroke-width="2.5"/>` +
    `<path d="M20 10.5 L25.5 27 L20 23.5 L14.5 27 Z" fill="#ffffff"/></g></svg>`;
  return svgDataUrl(svg);
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function LiveMap({
  apiKey,
  center,
  stops,
  bus,
  arrivalStopId,
  className,
  height,
  ariaLabel,
}: LiveMapProps) {
  const [mode, setMode] = useState<'schematic' | 'google'>('schematic');
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const stopMarkersRef = useRef<Map<string, GMarker>>(new Map());
  const busMarkerRef = useRef<GMarker | null>(null);

  // Upgrade to Google Maps when a key is provided; gracefully fall back to the
  // schematic view on any load failure. setState only fires inside promise
  // callbacks (never synchronously in the effect body).
  useEffect(() => {
    if (!apiKey) return;
    let alive = true;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (alive) setMode('google');
      })
      .catch(() => {
        if (alive) setMode('schematic');
      });
    return () => {
      alive = false;
    };
  }, [apiKey]);

  // Google mode: instantiate the map once. (Only reachable after the loader
  // resolved, so window.google.maps is guaranteed.)
  useEffect(() => {
    if (mode !== 'google') return;
    const g = getGoogle();
    const el = mapDivRef.current;
    if (!g || !el) return;
    const map = new g.maps.Map(el, {
      center: center ?? { lat: 30.2672, lng: -97.7431 },
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;
    return () => {
      for (const m of stopMarkersRef.current.values()) m.setMap(null);
      stopMarkersRef.current.clear();
      if (busMarkerRef.current) {
        busMarkerRef.current.setMap(null);
        busMarkerRef.current = null;
      }
      mapRef.current = null;
    };
    // center intentionally read at init only; later stops drive fitBounds.
  }, [mode]);

  // Google mode: sync numbered stop markers + fit bounds to the route.
  useEffect(() => {
    if (mode !== 'google') return;
    const g = getGoogle();
    const map = mapRef.current;
    if (!g || !map) return;
    const list = stops ?? [];
    const keep = new Set<string>();
    list.forEach((s, i) => {
      if (!Array.isArray(s.location?.coordinates) || s.location.coordinates.length < 2) return;
      keep.add(s.id);
      const pos = { lat: s.location.coordinates[1], lng: s.location.coordinates[0] };
      const icon = {
        url: stopPinUrl(s.sequence ?? i + 1, arrivalStopId === s.id),
        anchor: new g.maps.Point(17, 45),
      };
      const existing = stopMarkersRef.current.get(s.id);
      if (existing) {
        existing.setPosition(pos);
        existing.setIcon(icon);
      } else {
        stopMarkersRef.current.set(
          s.id,
          new g.maps.Marker({ position: pos, map, icon, title: s.name, zIndex: 5 }),
        );
      }
    });
    for (const [id, m] of stopMarkersRef.current) {
      if (!keep.has(id)) {
        m.setMap(null);
        stopMarkersRef.current.delete(id);
      }
    }
    if (list.length > 0) {
      const bounds = new g.maps.LatLngBounds();
      for (const s of list) {
        if (Array.isArray(s.location?.coordinates) && s.location.coordinates.length >= 2) {
          bounds.extend({ lat: s.location.coordinates[1], lng: s.location.coordinates[0] });
        }
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
    } else if (center) {
      map.setCenter(center);
      map.setZoom(14);
    }
  }, [mode, stops, arrivalStopId]);

  // Google mode: bus marker + panTo on every live position update.
  useEffect(() => {
    if (mode !== 'google') return;
    const g = getGoogle();
    if (!g) return;
    if (!bus) {
      if (busMarkerRef.current) {
        busMarkerRef.current.setMap(null);
        busMarkerRef.current = null;
      }
      return;
    }
    const pos = { lat: bus.lat, lng: bus.lng };
    const icon = {
      url: busPinUrl(bus.heading),
      anchor: new g.maps.Point(20, 20),
    };
    if (!busMarkerRef.current) {
      busMarkerRef.current = new g.maps.Marker({
        position: pos,
        map: mapRef.current,
        icon,
        zIndex: 20,
        title: 'Live bus position',
      });
    } else {
      busMarkerRef.current.setPosition(pos);
      busMarkerRef.current.setIcon(icon);
    }
    mapRef.current?.panTo(pos);
  }, [mode, bus]);

  const styleHeight = typeof height === 'number' ? { height: `${height}px` } : undefined;
  const heightClass = typeof height === 'number' ? undefined : height;
  const stopList = stops ?? [];

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? 'Live bus map'}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border bg-card',
        heightClass ?? 'h-72',
        className,
      )}
      style={styleHeight}
    >
      {mode === 'google' ? (
        <div ref={mapDivRef} className="h-full w-full" />
      ) : (
        <SchematicMap stops={stopList} bus={bus} arrivalStopId={arrivalStopId} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schematic fallback — real geometry, no external map library.        */
/* ------------------------------------------------------------------ */

const VB_W = 1000;
const VB_H = 620;

function SchematicMap({
  stops,
  bus,
  arrivalStopId,
}: {
  stops?: MapStop[];
  bus?: BusPosition;
  arrivalStopId?: string | null;
}) {
  // Equirectangular projection of the stops+bus bounding box into the viewBox:
  // pad 15% per side, uniform scale (aspect preserved), north up.
  const proj = useMemo(() => {
    const pts: { lng: number; lat: number }[] = [];
    for (const s of stops ?? []) {
      const c = s.location?.coordinates;
      if (Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        pts.push({ lng: c[0], lat: c[1] });
      }
    }
    if (bus && Number.isFinite(bus.lng) && Number.isFinite(bus.lat)) {
      pts.push({ lng: bus.lng, lat: bus.lat });
    }
    if (pts.length === 0) return null;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const spanLat = Math.max(maxLat - minLat, 0.0005);
    const spanLng = Math.max(maxLng - minLng, 0.0005);
    const midLat = (minLat + maxLat) / 2;
    // Equirectangular longitude correction so distances keep their aspect.
    const kx = Math.max(Math.cos((midLat * Math.PI) / 180), 0.2);
    const rawW = spanLng * kx;
    const rawH = spanLat;
    const totalW = rawW * 1.3; // +15% pad each side
    const totalH = rawH * 1.3;
    const scale = Math.min(VB_W / totalW, VB_H / totalH);
    const offX = (VB_W - rawW * scale) / 2;
    const offY = (VB_H - rawH * scale) / 2;
    const px = (lng: number) => offX + (lng - minLng) * kx * scale;
    const py = (lat: number) => offY + (maxLat - lat) * scale;
    return { px, py };
  }, [stops, bus]);

  const points = useMemo(() => {
    if (!proj) return [];
    return (stops ?? [])
      .filter((s) => Array.isArray(s.location?.coordinates) && s.location.coordinates.length >= 2)
      .map((s, i) => ({
        stop: s,
        x: proj.px(s.location.coordinates[0]),
        y: proj.py(s.location.coordinates[1]),
        num: s.sequence ?? i + 1,
      }));
  }, [proj, stops]);

  const busXY = proj && bus ? { x: proj.px(bus.lng), y: proj.py(bus.lat), heading: bus.heading ?? 0 } : null;

  const pathD =
    points.length > 1 ? points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') : '';

  return (
    <>
      {/* Map-paper texture: subtle grid via linear-gradient */}
      <div
        aria-hidden
        className="absolute inset-0 bg-brand-50 dark:bg-slate-900"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(100,116,139,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.16) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      {proj ? (
        <svg
          aria-hidden
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="relative h-full w-full overflow-visible"
        >
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#1976d2"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              /* Route line keeps ≥3:1 against the dark map paper (QA #22). */
              className="opacity-45 dark:opacity-70"
            />
          )}
          {points.map((p) => {
            const arrived = arrivalStopId === p.stop.id;
            const labelBelow = p.y < VB_H - 80;
            return (
              <g key={p.stop.id}>
                {arrived && (
                  <>
                    <circle cx={p.x} cy={p.y} r={26} fill="rgba(16,185,129,0.3)" className="motion-safe:animate-pulse" />
                    <circle cx={p.x} cy={p.y} r={23} fill="none" stroke="#10b981" strokeWidth={4} />
                  </>
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={16}
                  fill={arrived ? '#047857' : '#1976d2'}
                  stroke="#ffffff"
                  strokeWidth={3}
                />
                <text
                  x={p.x}
                  y={p.y + 5}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={700}
                  fill="#ffffff"
                >
                  {p.num}
                </text>
                <text
                  x={p.x}
                  y={labelBelow ? p.y + 40 : p.y - 28}
                  textAnchor="middle"
                  fontSize={16}
                  fontWeight={600}
                  stroke="#ffffff"
                  strokeWidth={4}
                  strokeLinejoin="round"
                  style={{ paintOrder: 'stroke' }}
                  fill="currentColor"
                  className="text-foreground"
                >
                  {p.stop.name}
                </text>
              </g>
            );
          })}
          {busXY && (
            <g
              className="motion-safe:transition-transform motion-safe:ease-out"
              style={{ transform: `translate(${busXY.x}px, ${busXY.y}px)`, transitionDuration: '900ms' }}
            >
              <circle r={21} fill="rgba(255,255,255,0.85)" />
              <circle r={16} fill="#1976d2" stroke="#0d47a1" strokeWidth={2.5} />
              <path d="M0,-10 L7,8 L0,4 L-7,8 Z" fill="#ffffff" transform={`rotate(${busXY.heading})`} />
            </g>
          )}
        </svg>
      ) : (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
          Route geometry and live positions will appear here.
        </p>
      )}
      <span className="sr-only">
        {points.length > 0 ? `Route stops in order: ${points.map((p) => p.stop.name).join(', ')}.` : 'No stops to show.'}
        {bus ? ' The bus position updates in real time.' : ''}
      </span>
      <p className="absolute inset-x-0 bottom-2 text-center text-xs text-muted-foreground">
        Schematic view — live positions update in real time
      </p>
    </>
  );
}
