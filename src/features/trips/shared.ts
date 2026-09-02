/**
 * Shared trip-domain types + helpers for the driver feature (contract §6/§7).
 * Kept module-light (no map/socket imports) so pages can consume it standalone.
 */

export type TripType = 'pickup' | 'dropoff';
export type TripStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type AttendanceStatus =
  | 'pending'
  | 'picked_up'
  | 'dropped_off'
  | 'absent'
  | 'returned_to_school';

export type MapStop = {
  id: string;
  name: string;
  sequence?: number;
  location: { type: 'Point'; coordinates: [number, number] };
};

export type AttendanceRow = {
  id: string;
  tripId: string;
  studentId: string;
  student?: { id: string; name: string; grade?: string } | null;
  stopId?: string | null;
  stopName?: string;
  type?: TripType;
  status: AttendanceStatus;
  verified: boolean;
  failedAttempts?: number;
  lockedUntil?: string;
};

export type Trip = {
  id: string;
  type: TripType;
  status: TripStatus;
  route?: { id: string; name?: string; stops?: MapStop[] } | null;
  bus?: { id: string; number?: string; plate?: string } | null;
  driver?: { id: string; name?: string } | null;
  scheduledStart?: string;
  scheduledEnd?: string;
  startedAt?: string;
  endedAt?: string;
  currentLocation?: { type: 'Point'; coordinates: [number, number] } | null;
  pendingCount?: number;
  attendance?: AttendanceRow[];
};

export const TRIP_TYPE_LABEL: Record<TripType, string> = {
  pickup: 'Morning pickup',
  dropoff: 'Evening drop-off',
};

/** Short labels used in chips/badges/selects (QA #4 — one map, no "Dropoff" drift). */
export const TRIP_TYPE_SHORT: Record<TripType, string> = {
  pickup: 'Pickup',
  dropoff: 'Drop-off',
};

/**
 * Deterministic 24h clock time (HH:mm) — QA M9. Locale-dependent
 * `toLocaleTimeString` rendered 12h output in some browsers while parent
 * surfaces use 24h; everything now flows through this one formatter.
 */
export function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatTimeRange(start?: string | null, end?: string | null): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}
