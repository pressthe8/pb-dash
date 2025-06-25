import React from 'react';

interface FlamingStopwatchLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animated?: boolean;
}

export const FlamingStopwatchLogo: React.FC<FlamingStopwatchLogoProps> = ({ 
  size = 'md', 
  className = '',
  animated = false 
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  return (
    <div className={`${sizeClasses[size]} ${className} relative`}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Gradient Definitions */}
        <defs>
          {/* Neon Blue to Cyan Gradient for Stopwatch */}
          <linearGradient id="stopwatchGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00D4FF" />
            <stop offset="50%" stopColor="#0099FF" />
            <stop offset="100%" stopColor="#0066FF" />
          </linearGradient>
          
          {/* Neon Pink to Orange Gradient for Flames */}
          <linearGradient id="flameGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF6B35" />
            <stop offset="50%" stopColor="#FF1493" />
            <stop offset="100%" stopColor="#FF00FF" />
          </linearGradient>
          
          {/* Glow Filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Flame Animation */}
          {animated && (
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="scale"
              values="1;1.05;1"
              dur="2s"
              repeatCount="indefinite"
            />
          )}
        </defs>

        {/* Flames */}
        <g filter="url(#glow)">
          {/* Main flame */}
          <path
            d="M65 25 C70 15, 80 20, 75 30 C80 25, 85 30, 80 35 C85 30, 90 35, 85 40 C80 35, 75 40, 70 35 C75 30, 70 25, 65 25 Z"
            fill="url(#flameGradient)"
            stroke="url(#flameGradient)"
            strokeWidth="1"
          >
            {animated && (
              <animateTransform
                attributeName="transform"
                attributeType="XML"
                type="scale"
                values="1;1.1;0.95;1"
                dur="1.5s"
                repeatCount="indefinite"
              />
            )}
          </path>
          
          {/* Secondary flame */}
          <path
            d="M75 30 C78 22, 85 25, 82 32 C85 28, 88 32, 85 36 C82 32, 78 35, 75 30 Z"
            fill="url(#flameGradient)"
            stroke="url(#flameGradient)"
            strokeWidth="1"
            opacity="0.8"
          >
            {animated && (
              <animateTransform
                attributeName="transform"
                attributeType="XML"
                type="scale"
                values="1;0.9;1.05;1"
                dur="1.8s"
                repeatCount="indefinite"
              />
            )}
          </path>
          
          {/* Small flame */}
          <path
            d="M82 35 C84 30, 88 32, 86 36 C88 34, 90 36, 88 38 C86 36, 84 38, 82 35 Z"
            fill="url(#flameGradient)"
            stroke="url(#flameGradient)"
            strokeWidth="1"
            opacity="0.6"
          >
            {animated && (
              <animateTransform
                attributeName="transform"
                attributeType="XML"
                type="scale"
                values="1;1.15;0.9;1"
                dur="1.2s"
                repeatCount="indefinite"
              />
            )}
          </path>
        </g>

        {/* Stopwatch Body */}
        <g filter="url(#glow)">
          {/* Outer ring */}
          <circle
            cx="45"
            cy="55"
            r="25"
            fill="none"
            stroke="url(#stopwatchGradient)"
            strokeWidth="3"
          />
          
          {/* Inner ring */}
          <circle
            cx="45"
            cy="55"
            r="20"
            fill="none"
            stroke="url(#stopwatchGradient)"
            strokeWidth="2"
            opacity="0.7"
          />
          
          {/* Watch face */}
          <circle
            cx="45"
            cy="55"
            r="18"
            fill="rgba(0, 100, 255, 0.1)"
            stroke="none"
          />
          
          {/* Crown/winding mechanism */}
          <rect
            x="42"
            y="25"
            width="6"
            height="8"
            rx="2"
            fill="url(#stopwatchGradient)"
            stroke="url(#stopwatchGradient)"
            strokeWidth="1"
          />
          
          {/* Crown top */}
          <rect
            x="44"
            y="22"
            width="2"
            height="4"
            rx="1"
            fill="url(#stopwatchGradient)"
          />
          
          {/* Start/stop button */}
          <rect
            x="25"
            y="40"
            width="4"
            height="6"
            rx="2"
            fill="url(#stopwatchGradient)"
            opacity="0.8"
          />
        </g>

        {/* Watch hands */}
        <g filter="url(#glow)">
          {/* Hour hand */}
          <line
            x1="45"
            y1="55"
            x2="45"
            y2="45"
            stroke="url(#stopwatchGradient)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          
          {/* Minute hand */}
          <line
            x1="45"
            y1="55"
            x2="52"
            y2="48"
            stroke="url(#stopwatchGradient)"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            {animated && (
              <animateTransform
                attributeName="transform"
                attributeType="XML"
                type="rotate"
                values="0 45 55;360 45 55"
                dur="4s"
                repeatCount="indefinite"
              />
            )}
          </line>
          
          {/* Center dot */}
          <circle
            cx="45"
            cy="55"
            r="2"
            fill="url(#stopwatchGradient)"
          />
        </g>
      </svg>
    </div>
  );
};