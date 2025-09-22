// Shared types for Cloud Functions
export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  created_at: number;
  last_sync_at?: string;
}

export interface Concept2Result {
  id: number;
  user_id: number;
  date: string;
  timezone: string | null;
  date_utc: string | null;
  distance: number;
  type: 'rower' | 'skierg' | 'bikeerg';
  time: number;
  time_formatted: string;
  workout_type: string;
  source: string;
  weight_class: string;
  verified: boolean;
  ranked: boolean;
  comments: string | null;
  privacy: string;
}

export interface Concept2ApiResponse {
  data: Concept2Result[];
  meta: {
    pagination: {
      total: number;
      count: number;
      per_page: number;
      current_page: number;
      total_pages: number;
      links: any[];
    };
  };
}

export interface SyncRequest {
  userId: string;
  syncType: 'initial' | 'incremental';
  forceFullSync?: boolean;
}

export interface SyncResponse {
  success: boolean;
  newResultsCount: number;
  totalResultsCount: number;
  lastSyncAt: string;
  error?: string;
}

export interface StoredResult extends Concept2Result {
  firebase_user_id: string;
  raw_data: any;
  pace_per_500m: number | null;
  created_at: any; // Firestore timestamp
  updated_at: any; // Firestore timestamp
}

export interface PREvent {
  id: string;
  user_id: string;
  results_id: string;           // Reference to original result
  activity_key: string;         // Links to pr_types.activity_key
  sport: 'rower' | 'skierg' | 'bikeerg'; // NEW: Sport field for efficient filtering
  pr_scope: string[];          // ["all-time", "season-2025", "year-2024"]
  metric_type: string;
  metric_value: number;        // Time in seconds OR distance in meters
  achieved_at: string;         // ISO timestamp
  season_identifier: string;   // "2025" (end year of season)
  previous_record: any;
  pace_per_500m: number | null;
  created_at: any; // Firestore timestamp
  updated_at: any; // Firestore timestamp
}

export interface SlackNotificationPayload {
  type: 'new_user' | 'error' | 'pb_image_saved';
  
  // Common fields (optional, but useful for context)
  userId?: string; // Firebase User ID (internal, non-identifiable)

  // Specific details based on the 'type'
  details?: {
    // For 'new_user'
    authProvider?: string; // e.g., 'Google'

    // For 'error'
    errorMessage?: string;
    errorStack?: string; // Full stack trace
    context?: string; // e.g., 'Cloud Function: initialDataLoad', 'Frontend: DashboardPage'

    // For 'pb_image_saved'
    imageUrl?: string; // Public URL of the saved image
    sport?: string; // e.g., 'Row', 'Bike', 'Ski'
    userDisplayName?: string; // User's display name (non-sensitive)
  };
}