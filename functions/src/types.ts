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
  results_id: string;
  activity_key: string;
  pr_scope: string[];
  metric_type: string;
  metric_value: number;
  achieved_at: string;
  season_identifier: string;
  previous_record: any;
  pace_per_500m: number | null;
  created_at: any; // Firestore timestamp
  updated_at: any; // Firestore timestamp
}