export interface PRType {
  id: string;
  activity_name: string;        // Display name: "2K Row", "60min Row"
  activity_key: string;         // Unique identifier: "2k_row", "60min_row"
  sport: string;               // "rower", "bike", "skierg"
  metric_type: "time" | "distance";
  target_distance: number | null;  // For distance-based activities (meters)
  target_time: number | null;      // For time-based activities (seconds)
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface PREvent {
  id: string;
  user_id: string;
  results_id: string;           // Reference to original result
  activity_key: string;         // Links to pr_types.activity_key
  sport: SportType;            // NEW: Sport field for efficient filtering
  pr_scope: string[];          // ["all-time", "season-2025", "year-2024"]
  metric_type: "time" | "distance";
  metric_value: number;        // Time in seconds OR distance in meters
  achieved_at: string;         // ISO timestamp
  season_identifier: string;   // "2025" (end year of season)
  previous_record: number | null;  // Previous best value (null for first PR)
  pace_per_500m: number | null; // Add the new pace field
  created_at: string;
  updated_at: string;
}

export interface PRStats {
  activity_key: string;
  activity_name: string;
  all_time_record: PREvent | null;
  current_season_record: PREvent | null;
  current_year_record: PREvent | null;
  total_attempts: number;
  improvement_count: number;
}

export interface PRProgression {
  activity_key: string;
  records: PREvent[];
  improvements: {
    date: string;
    value: number;
    improvement: number;
  }[];
}

// NEW: User profile interface
export interface UserProfile {
  user_id: string;              // Concept2 user ID
  created_at: string;
  last_updated: string;
  season_view: boolean;         // Show season view by default
  private: boolean;             // Profile privacy setting
  default_sport?: SportType;    // Default sport for dashboard
}

// NEW: Sport filtering types - Updated to use 'bike' instead of 'bikeerg'
export type SportType = 'rower' | 'bike' | 'skierg';
export type SportDisplayType = 'Row' | 'Bike' | 'Ski';

// Sport mapping constant - Updated to use 'bike'
export const SPORT_MAPPING: Record<SportType, SportDisplayType> = {
  'rower': 'Row',
  'bike': 'Bike',
  'skierg': 'Ski'
};

// Helper function to determine sport from activity key (DEPRECATED - use event.sport instead)
export const getSportFromActivityKey = (activityKey: string): SportType => {
  if (activityKey.includes('_row')) return 'rower';
  if (activityKey.includes('_bike')) return 'bike';
  if (activityKey.includes('_ski')) return 'skierg';
  return 'rower'; // fallback
};