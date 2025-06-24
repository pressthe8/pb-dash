import { useState, useEffect, useMemo } from 'react';
import { SportType, SportDisplayName, SPORT_MAPPINGS } from '../types/sports';
import { StoredResult } from '../types/concept2';

interface UseSportFilterProps {
  allResults: StoredResult[];
  userDefaultSport?: SportType;
}

export const useSportFilter = ({ allResults, userDefaultSport }: UseSportFilterProps) => {
  // Reason: Calculate smart default based on highest count of results
  const smartDefaultSport = useMemo(() => {
    if (allResults.length === 0) return 'rower';
    
    const sportCounts = allResults.reduce((counts, result) => {
      counts[result.type] = (counts[result.type] || 0) + 1;
      return counts;
    }, {} as Record<SportType, number>);
    
    // Find sport with highest count
    const sortedSports = Object.entries(sportCounts).sort(([,a], [,b]) => b - a);
    return sortedSports[0]?.[0] as SportType || 'rower';
  }, [allResults]);

  // Reason: Use profile default if available, otherwise use smart default
  const defaultSport = userDefaultSport || smartDefaultSport;

  // Reason: Get current session filter from localStorage, fallback to default
  const [selectedSport, setSelectedSport] = useState<SportType>(() => {
    const saved = localStorage.getItem('dashboard_sport_filter');
    return (saved as SportType) || defaultSport;
  });

  // Reason: Update localStorage when selection changes for session persistence
  useEffect(() => {
    localStorage.setItem('dashboard_sport_filter', selectedSport);
  }, [selectedSport]);

  // Reason: Update selected sport when default changes (e.g., new data loaded)
  useEffect(() => {
    const saved = localStorage.getItem('dashboard_sport_filter');
    if (!saved) {
      setSelectedSport(defaultSport);
    }
  }, [defaultSport]);

  const selectedSportDisplay = SPORT_MAPPINGS[selectedSport].display;

  return {
    selectedSport,
    selectedSportDisplay,
    setSelectedSport,
    smartDefaultSport
  };
};