/**
 * Tracking Provider Adapter — Abstract Interface
 *
 * All tracking providers (SeaRates, mock, future providers)
 * must implement this interface. The service layer uses this
 * abstraction to switch providers without changing business logic.
 */

import type { TrackingResult, TrackingLookupRequest, TrackingProviderConfig } from "../types";

export interface TrackingProviderAdapter {
  /** Human-readable provider name */
  readonly name: string;

  /** Whether this provider is available (has valid config/key) */
  isAvailable(): boolean;

  /**
   * Look up a shipment by tracking number.
   * Must return a normalized TrackingResult regardless of success or failure.
   * Must handle its own errors and never throw — always return a result.
   */
  lookup(request: TrackingLookupRequest): Promise<TrackingResult>;
}

/**
 * Factory function type for creating provider instances.
 */
export type TrackingProviderFactory = (
  config: TrackingProviderConfig,
) => TrackingProviderAdapter;
