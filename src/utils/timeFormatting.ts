/**
 * Shared time formatting utility for rowing times
 *
 * For times under 1 hour:
 * - Shows M:SS.T format (e.g., "2:09.9", "19:58.8")
 * - Always includes tenths
 *
 * For times 1 hour or longer:
 * - Shows H:MM:SS format (e.g., "1:23:45")
 * - No tenths displayed for cleaner look on marathon distances
 */
export const formatTime = (totalTenthsOfSeconds: number): string => {
  // Convert tenths of seconds to actual seconds
  const totalSeconds = totalTenthsOfSeconds / 10;

  // Handle edge cases
  if (totalSeconds < 0) return "0:00.0";
  if (!isFinite(totalSeconds)) return "0:00.0";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    // For times over an hour: H:MM:SS (no tenths)
    const wholeSeconds = Math.floor(seconds);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}`;
  } else {
    // For times under an hour: M:SS.T (with tenths)
    const wholeSeconds = Math.floor(seconds);
    // Use Math.round here for tenths to ensure correct rounding,
    // though Math.floor is fine if truncation is desired
    const tenths = Math.floor((seconds - wholeSeconds) * 10);
    return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}.${tenths}`;
  }
};