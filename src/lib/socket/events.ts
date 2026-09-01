/**
 * SafeBus Socket.IO contract — the ONLY place event names appear.
 * Frozen against docs/CONTRACTS.md §13 (verified against the reference backend's
 * runtime probe; see worklog Task 2).
 */
export const SE = {
  // server → client
  TRIP_LOCATION: 'trip:location',
  TRIP_ETA: 'trip:eta',
  TRIP_ARRIVED: 'trip:arrived',
  TRIP_STATUS: 'trip:status',
  ATTENDANCE_UPDATE: 'attendance:update',
  STUDENT_STATUS: 'student:status',
  MESSAGE_NEW: 'message:new',
  MESSAGE_READ: 'message:read',
  EMERGENCY_NEW: 'emergency:new',
  EMERGENCY_UPDATE: 'emergency:update',
  NOTIFICATION_NEW: 'notification:new',
  // client → server
  JOIN_TRIP: 'trip:join',
} as const;

export type ServerEvent = (typeof SE)[keyof typeof SE];
