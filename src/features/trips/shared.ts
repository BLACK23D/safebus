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

export function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
