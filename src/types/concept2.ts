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

export interface StoredResult extends Concept2Result {
  firebase_user_id: string;
  created_at: string;
  updated_at: string;
  raw_data: any;
  pace_per_500m: number | null; // Add the new pace field
}
