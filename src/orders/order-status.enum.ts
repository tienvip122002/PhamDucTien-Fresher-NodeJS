/**
 * Order lifecycle:
 *
 *   PENDING ──(job succeeds)──────────▶ CONFIRMED
 *      │  └──(job fails all attempts)──▶ FAILED      (stock restored)
 *      └──(cancel / expired)───────────▶ CANCELLED   (stock restored)
 *   CONFIRMED ──(cancel)───────────────▶ CANCELLED   (stock restored)
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}
