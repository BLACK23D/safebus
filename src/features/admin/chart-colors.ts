/** Shared chart palette — kept separate from dashboard-charts so non-chart code
 * (legends, badges) can reference the same colors without importing recharts. */
export const FLEET_COLORS: Record<string, string> = {
  active: '#10b981',
  inactive: '#64748b',
  maintenance: '#f59e0b',
};
