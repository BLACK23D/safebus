'use client';

/**
 * Admin dashboard charts, split into their own module so recharts (+ d3
 * internals, ~100KB gz) is loaded lazily via next/dynamic only when the
 * dashboard actually renders charts (issue #21 — mirrors the LiveMap pattern).
 * Colors come from the tiny chart-colors module — never import this module
 * from server-adjacent code.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FLEET_COLORS } from './chart-colors';

export function FleetStatusChart({ data }: { data: { status: string; count: number }[] }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="status"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={3}
            strokeWidth={0}
          >
            {data.map((f) => (
              <Cell key={f.status} fill={FLEET_COLORS[f.status] ?? '#64748b'} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {data.map((f) => (
          <span key={f.status} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: FLEET_COLORS[f.status] ?? '#64748b' }}
            />
            {f.status} <span className="font-bold text-foreground">{f.count}</span>
          </span>
        ))}
      </div>
    </>
  );
}

export function TripsPerDayChart({ data }: { data: { label: string; trips: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(100,116,139,0.25)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={36} />
        <Tooltip cursor={{ fill: 'rgba(25,118,210,0.08)' }} />
        <Bar dataKey="trips" name="Trips" fill="#1976d2" radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AttendanceTrendChart({ data }: { data: { label: string; rate: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(100,116,139,0.25)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={12} width={36} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="rate"
          name="Present %"
          stroke="#10b981"
          strokeWidth={2.5}
          dot={{ r: 3, fill: '#10b981' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
