export type HomeDashboardIssueTone = 'attention' | 'critical';

export function shouldShowHomeDashboardSystemBreakdown(showPropertyDestinations: boolean) {
  return !showPropertyDestinations;
}

export function resolveHomeDashboardIssueTone(status: string): HomeDashboardIssueTone {
  return status === 'critical' ? 'critical' : 'attention';
}
