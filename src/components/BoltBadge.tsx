import React from 'react';

export const BoltBadge: React.FC = () => {
  return (
    <>
      {/* Custom Bolt.new Badge Configuration */}
      <style>
        {`
          .bolt-badge {
            transition: all 0.3s ease;
          }
          @keyframes badgeHover {
            0% { transform: scale(1) rotate(0deg); }
            50% { transform: scale(1.1) rotate(22deg); }
            100% { transform: scale(1) rotate(0deg); }
          }
          .bolt-badge:hover {
            animation: badgeHover 0.6s ease-in-out;
          }
        `}
      </style>
      <div className="fixed top-4 right-4 z-50">
        <a 
          href="https://bolt.new/?rid=os72mi" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="block transition-all duration-300 hover:shadow-2xl"
        >
          <img 
            src="https://storage.bolt.army/black_circle_360x360.png" 
            alt="Built with Bolt.new badge" 
            className="w-12 h-12 md:w-16 md:h-16 rounded-full shadow-lg bolt-badge"
          />
        </a>
      </div>
    </>
  );
};