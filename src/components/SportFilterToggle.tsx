import React from 'react';
import { Rows, Bike, Mountain } from 'lucide-react';
import { SportType, SPORT_MAPPINGS, SPORT_DISPLAY_ORDER } from '../types/sports';

interface SportFilterToggleProps {
  selectedSport: SportType;
  onSportChange: (sport: SportType) => void;
  size?: 'small' | 'large';
  className?: string;
}

export const SportFilterToggle: React.FC<SportFilterToggleProps> = ({
  selectedSport,
  onSportChange,
  size = 'large',
  className = ''
}) => {
  const getIcon = (sportType: SportType) => {
    switch (sportType) {
      case 'rower':
        return <Rows className={size === 'large' ? 'w-5 h-5' : 'w-4 h-4'} />;
      case 'bikeerg':
        return <Bike className={size === 'large' ? 'w-5 h-5' : 'w-4 h-4'} />;
      case 'skierg':
        return <Mountain className={size === 'large' ? 'w-5 h-5' : 'w-4 h-4'} />;
      default:
        return <Rows className={size === 'large' ? 'w-5 h-5' : 'w-4 h-4'} />;
    }
  };

  const baseClasses = size === 'large' 
    ? 'flex items-center bg-slate-100 rounded-xl p-1.5'
    : 'flex items-center bg-slate-100 rounded-lg p-1';

  const buttonClasses = size === 'large'
    ? 'px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2'
    : 'px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200 flex items-center space-x-1.5';

  return (
    <div className={`${baseClasses} ${className}`}>
      {SPORT_DISPLAY_ORDER.map((sportType) => {
        const isSelected = selectedSport === sportType;
        const sportMapping = SPORT_MAPPINGS[sportType];
        
        return (
          <button
            key={sportType}
            onClick={() => onSportChange(sportType)}
            className={`${buttonClasses} ${
              isSelected
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {getIcon(sportType)}
            <span>{sportMapping.display}</span>
          </button>
        );
      })}
    </div>
  );
};