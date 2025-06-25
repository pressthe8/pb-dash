// NEW: Sport filtering types
export type SportType = 'rower' | 'bike' | 'skierg'; // Changed 'bikeerg' to 'bike'
export type SportDisplayType = 'Row' | 'Bike' | 'Ski';

// Sport mapping constant
export const SPORT_MAPPING: Record<SportType, SportDisplayType> = {
  'rower': 'Row',
  'bike': 'Bike',    // Changed from 'bikeerg': 'Bike'
  'skierg': 'Ski'
};

// Helper function to determine sport from activity key (DEPRECATED - use event.sport instead)
export const getSportFromActivityKey = (activityKey: string): SportType => {
  if (activityKey.includes('_row')) return 'rower';
  if (activityKey.includes('_bike')) return 'bike';    // Changed from 'bikeerg'
  if (activityKey.includes('_ski')) return 'skierg';
  return 'rower'; // fallback
};