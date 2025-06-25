import React from 'react';

interface FlamingStopwatchLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const FlamingStopwatchLogo: React.FC<FlamingStopwatchLogoProps> = ({ 
  size = 'md', 
  className = ''
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8', 
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      <img 
        src="/IMG_9029.PNG" 
        alt="PB Dash - Flaming Stopwatch Logo" 
        className="w-full h-full object-contain"
      />
    </div>
  );
};