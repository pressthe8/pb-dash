export type SportType = 'rower' | 'bikeerg' | 'skierg';
export type SportDisplayName = 'Row' | 'Bike' | 'Ski';

export interface SportMapping {
  type: SportType;
  display: SportDisplayName;
  icon: string;
}

export const SPORT_MAPPINGS: Record<SportType, SportMapping> = {
  rower: {
    type: 'rower',
    display: 'Row',
    icon: 'Rows'
  },
  bikeerg: {
    type: 'bikeerg', 
    display: 'Bike',
    icon: 'Bike'
  },
  skierg: {
    type: 'skierg',
    display: 'Ski',
    icon: 'Mountain'
  }
};

export const SPORT_DISPLAY_ORDER: SportType[] = ['rower', 'bikeerg', 'skierg'];