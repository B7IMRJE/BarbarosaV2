import {
  resolveHomeDashboardIssueTone,
  shouldShowHomeDashboardSystemBreakdown,
} from './homeDashboardPresentation';
import { shouldShowPropertyDestinations } from './propertyLandingNavigation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Home dashboard presentation regression failed: ${message}`);
}

assert(
  !shouldShowHomeDashboardSystemBreakdown(shouldShowPropertyDestinations(false)),
  'The property-first homeowner root must hide the legacy Water Service, Gas Service, and system cards.'
);
assert(
  shouldShowHomeDashboardSystemBreakdown(shouldShowPropertyDestinations(true)),
  'Provider-mode HomeOS must retain the legacy system breakdown.'
);
assert(
  shouldShowHomeDashboardSystemBreakdown(false),
  'The Services route default must retain the legacy system breakdown.'
);
assert(
  resolveHomeDashboardIssueTone('needs_attention') === 'attention',
  'Needs Attention items must use the yellow attention treatment from the legend.'
);
assert(
  resolveHomeDashboardIssueTone('critical') === 'critical',
  'Critical items must use the red critical treatment from the legend.'
);
