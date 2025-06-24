import { SportType } from '../types/sports';
import { StoredResult } from '../types/concept2';
import { PRStats, PREvent } from '../types/personalRecords';

/**
 * Filter results by sport type
 */
export const filterResultsBySport = (results: StoredResult[], sport: SportType): StoredResult[] => {
  return results.filter(result => result.type === sport);
};

/**
 * Filter PR stats by sport type
 */
export const filterPRStatsBySport = (prStats: PRStats[], sport: SportType): PRStats[] => {
  return prStats.filter(stat => {
    // Reason: Check if the activity key corresponds to the selected sport
    // All rowing activities end with '_row', bikeerg with '_bike', skierg with '_ski'
    if (sport === 'rower') {
      return stat.activity_key.endsWith('_row');
    } else if (sport === 'bikeerg') {
      return stat.activity_key.endsWith('_bike');
    } else if (sport === 'skierg') {
      return stat.activity_key.endsWith('_ski');
    }
    return false;
  });
};

/**
 * Filter PR events by sport type
 */
export const filterPREventsBySport = (prEvents: PREvent[], sport: SportType): PREvent[] => {
  return prEvents.filter(event => {
    // Reason: Same logic as PR stats filtering
    if (sport === 'rower') {
      return event.activity_key.endsWith('_row');
    } else if (sport === 'bikeerg') {
      return event.activity_key.endsWith('_bike');
    } else if (sport === 'skierg') {
      return event.activity_key.endsWith('_ski');
    }
    return false;
  });
};

/**
 * Calculate dashboard stats for filtered results
 */
export const calculateFilteredStats = (results: StoredResult[]) => {
  const totalWorkouts = results.length;
  const totalDistance = results.reduce((sum, result) => sum + result.distance, 0);
  const totalTime = results.reduce((sum, result) => sum + result.time, 0);
  const averageDistance = totalWorkouts > 0 ? totalDistance / totalWorkouts : 0;

  return {
    totalWorkouts,
    totalDistance,
    totalTime,
    averageDistance
  };
};