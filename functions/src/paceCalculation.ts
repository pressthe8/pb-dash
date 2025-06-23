/**
 * Shared pace calculation utility for Cloud Functions
 * 
 * Calculate pace per 500m using the formula: (time * 50) / distance
 * @param time - Time in tenths of seconds (as stored in Concept2 results)
 * @param distance - Distance in meters
 * @returns Pace in tenths of seconds per 500m, or null if distance is invalid
 */
export function calculatePaceFor500m(time: number, distance: number): number | null {
  // All Concept2 results should have valid distance > 0
  // Time-based events show the distance achieved during that time period
  if (distance <= 0) return null;
  
  // Formula: (time * 50) / distance = pace in seconds per 500m
  const paceInSeconds = (time * 50) / distance;
  
  // Convert to tenths for consistency with formatTime function
  return Math.round(paceInSeconds * 10);
}