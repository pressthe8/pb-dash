import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ArrowLeft, Trophy, Clock, Zap, Target, Mountain, MapPin } from 'lucide-react';
import { PRStats, PREvent, SportType, SPORT_MAPPING } from '../types/personalRecords';
import { formatTime } from '../utils/timeFormatting';
import { PRProgressionChart } from './PRProgressionChart';

interface PersonalBestsTableViewProps {
  prStats: PRStats[];
  loading: boolean;
  allPREvents: PREvent[];
  selectedSport?: SportType;
}

interface DetailViewData {
  activityKey: string;
  activityName: string;
  allAttempts: PREvent[];
}

type ViewMode = 'table' | 'detail';
type SortField = 'achieved_at' | 'metric_value';
type SortDirection = 'asc' | 'desc';

export const PersonalBestsTableView: React.FC<PersonalBestsTableViewProps> = ({ 
  prStats, 
  loading,
  allPREvents,
  selectedSport
}) => {
  // State management
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedFilter, setSelectedFilter] = useState<string>('all-time');
  const [detailView, setDetailView] = useState<DetailViewData | null>(null);
  const [sortField, setSortField] = useState<SortField>('achieved_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Helper function to get season identifier from date
  const getSeasonIdentifier = (date: Date): string => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-based (0 = January)
    
    // If January-April, use current year
    // If May-December, use next year
    const seasonEndYear = month < 4 ? year : year + 1;
    return seasonEndYear.toString();
  };

  // Helper function to format season display
  const formatSeasonDisplay = (seasonId: string): string => {
    const endYear = parseInt(seasonId);
    const startYear = endYear - 1;
    return `${startYear}/${seasonId.slice(-2)}`;
  };

  // Get available periods from PR events, respecting profile settings
  const availablePeriods = useMemo(() => {
    if (!allPREvents || allPREvents.length === 0) {
      return ['all-time'];
    }

    const periods = new Set<string>(['all-time']);
    
    // Get profile setting from localStorage (set by ProfilePage)
    const profileSeasonView = localStorage.getItem('pr_view_mode') === 'season';
    
    allPREvents.forEach(event => {
      if (profileSeasonView) {
        // Show seasons if profile setting is season view
        periods.add(`season-${event.season_identifier}`);
      } else {
        // Show years if profile setting is year view
        const year = new Date(event.achieved_at).getFullYear().toString();
        periods.add(`year-${year}`);
      }
    });

    const sortedPeriods = Array.from(periods).sort((a, b) => {
      if (a === 'all-time') return -1;
      if (b === 'all-time') return 1;
      
      // Extract year for comparison
      const getYear = (period: string) => {
        if (period.startsWith('year-')) return parseInt(period.split('-')[1]);
        if (period.startsWith('season-')) return parseInt(period.split('-')[1]);
        return 0;
      };
      
      return getYear(b) - getYear(a); // Descending order (newest first)
    });

    return sortedPeriods;
  }, [allPREvents]);

  // Display pace from PR event data
  const displayPace = (event: PREvent): string => {
    if (event.pace_per_500m) {
      // pace_per_500m is already in tenths, so formatTime can use it directly
      return formatTime(event.pace_per_500m);
    }
    return 'N/A';
  };

  // Format distance for display - always show metres with comma separators
  const formatDistance = (meters: number): string => {
    // Always show in metres with comma separator for thousands
    return `${meters.toLocaleString()}m`;
  };

  // Determine if this is a time-based event (fixed time, variable distance)
  const isTimeBasedEvent = (activityKey: string): boolean => {
    return activityKey.includes('min_') || activityKey.includes('sec_');
  };

  // Format the PB value based on event type
  const formatPBValue = (event: PREvent): string => {
    if (event.metric_type === 'time') {
      // Distance-based event: show time
      return formatTime(event.metric_value);
    } else {
      // Time-based event: show distance
      return formatDistance(event.metric_value);
    }
  };

  // Get dynamic column header based on selected filter
  const getPBColumnHeader = (): string => {
    if (selectedFilter === 'all-time') {
      return 'PB';
    } else if (selectedFilter.startsWith('year-')) {
      const year = selectedFilter.split('-')[1];
      return `${year} PB`;
    } else if (selectedFilter.startsWith('season-')) {
      const season = selectedFilter.split('-')[1];
      return `${formatSeasonDisplay(season)} PB`;
    }
    return 'PB';
  };

  // Check if we should show trophy (only for all-time records when filtering)
  const shouldShowTrophy = (stat: any): boolean => {
    if (selectedFilter === 'all-time') {
      return true; // Always show trophy for all-time view
    }
    
    // For filtered views, only show trophy if this record is also the all-time record
    return stat.selectedRecord && stat.all_time_record && 
           stat.selectedRecord.id === stat.all_time_record.id;
  };

  // Get event icon and color scheme - simplified and cleaner
  const getEventIconAndColor = (activityKey: string) => {
    // Time-based events get clock icon
    if (isTimeBasedEvent(activityKey)) {
      return {
        icon: <Clock className="w-4 h-4" />,
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-700',
        iconColor: 'text-orange-500',
        colorName: 'orange'
      };
    }
    
    // Distance-based events get different icons based on distance category
    if (activityKey.includes('100m') || activityKey.includes('500m')) {
      // Sprint distances - lightning bolt
      return {
        icon: <Zap className="w-4 h-4" />,
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        iconColor: 'text-red-500',
        colorName: 'red'
      };
    } else if (activityKey.includes('1k') || activityKey.includes('2k')) {
      // Middle distances - target
      return {
        icon: <Target className="w-4 h-4" />,
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        iconColor: 'text-blue-500',
        colorName: 'blue'
      };
    } else if (activityKey.includes('5k') || activityKey.includes('6k') || activityKey.includes('10k')) {
      // Long distances - mountain
      return {
        icon: <Mountain className="w-4 h-4" />,
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
        iconColor: 'text-green-500',
        colorName: 'green'
      };
    } else if (activityKey.includes('marathon') || activityKey.includes('half_marathon')) {
      // Ultra distances - map pin
      return {
        icon: <MapPin className="w-4 h-4" />,
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-700',
        iconColor: 'text-purple-500',
        colorName: 'purple'
      };
    }

    // Default fallback
    return {
      icon: <Target className="w-4 h-4" />,
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-700',
      iconColor: 'text-slate-500',
      colorName: 'slate'
    };
  };

  // Get filtered PR stats based on selected period
  const filteredPRStats = useMemo(() => {
    return prStats.map(stat => {
      let selectedRecord: PREvent | null = null;

      if (selectedFilter === 'all-time') {
        selectedRecord = stat.all_time_record;
      } else if (selectedFilter.startsWith('year-')) {
        const year = selectedFilter.split('-')[1];
        selectedRecord = allPREvents.find(event => 
          event.activity_key === stat.activity_key &&
          event.pr_scope.includes(`year-${year}`)
        ) || null;
      } else if (selectedFilter.startsWith('season-')) {
        const season = selectedFilter.split('-')[1];
        selectedRecord = allPREvents.find(event => 
          event.activity_key === stat.activity_key &&
          event.pr_scope.includes(`season-${season}`)
        ) || null;
      }

      return {
        ...stat,
        selectedRecord
      };
    }).filter(stat => stat.selectedRecord !== null); // Only show activities with records for selected period
  }, [prStats, allPREvents, selectedFilter]);

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Format period display name
  const formatPeriodDisplay = (period: string): string => {
    if (period === 'all-time') return 'All-Time';
    if (period.startsWith('year-')) return period.split('-')[1];
    if (period.startsWith('season-')) return formatSeasonDisplay(period.split('-')[1]);
    return period;
  };

  // Handle row click to show detail view
  const handleRowClick = (stat: any) => {
    const activityEvents = allPREvents.filter(event => 
      event.activity_key === stat.activity_key
    );

    setDetailView({
      activityKey: stat.activity_key,
      activityName: stat.activity_name,
      allAttempts: activityEvents
    });
    setViewMode('detail');
  };

  // Handle back to table view
  const handleBackToTable = () => {
    setViewMode('table');
    setDetailView(null);
  };

  // Sort detail view data
  const sortedDetailData = useMemo(() => {
    if (!detailView) return [];

    const sorted = [...detailView.allAttempts].sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      if (sortField === 'achieved_at') {
        aValue = new Date(a.achieved_at).getTime();
        bValue = new Date(b.achieved_at).getTime();
      } else {
        aValue = a.metric_value;
        bValue = b.metric_value;
      }

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return sorted;
  }, [detailView, sortField, sortDirection]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'achieved_at' ? 'desc' : 'asc'); // Default: newest first for date, best first for performance
    }
  };

  // Check if an attempt is the all-time record
  const isAllTimeRecord = (attempt: PREvent): boolean => {
    return attempt.pr_scope.includes('all-time');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Personal Bests</h2>
        </div>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (prStats.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Personal Bests</h2>
        </div>
        <div className="p-6 text-center">
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No Personal Bests for {selectedSport ? SPORT_MAPPING[selectedSport] : 'Selected Sport'} Yet
          </h3>
          <p className="text-slate-600">
            Complete some {selectedSport ? SPORT_MAPPING[selectedSport].toLowerCase() : 'selected sport'} workouts to start tracking your PBs.
          </p>
        </div>
      </div>
    );
  }

  // Detail View
  if (viewMode === 'detail' && detailView) {
    const isTimeBased = isTimeBasedEvent(detailView.activityKey);
    const iconAndColors = getEventIconAndColor(detailView.activityKey);
    
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className={`p-6 border-b ${iconAndColors.border} ${iconAndColors.bg}`}>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBackToTable}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors duration-200"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex items-center space-x-3">
              <div className={`p-2 bg-white rounded-lg ${iconAndColors.border} border`}>
                <div className={iconAndColors.iconColor}>
                  {iconAndColors.icon}
                </div>
              </div>
              <div>
                <h2 className={`text-xl font-semibold ${iconAndColors.text}`}>{detailView.activityName}</h2>
                <p className="text-slate-600">All attempts ({detailView.allAttempts.length})</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {/* Progression Chart - NOW FIRST */}
          <div className="mb-8">
            <h3 className="text-lg font-medium text-slate-900 mb-2">Pace Progression</h3>
            <p className="text-sm text-slate-600 mb-4">
              Track your pace improvement over time. Gold points are all-time PBs, blue points are other personal records.
            </p>
            <PRProgressionChart 
              events={detailView.allAttempts}
              activityName={detailView.activityName}
              activityKey={detailView.activityKey}
            />
          </div>

          {/* Results Table - NOW SECOND */}
          <div>
            <h3 className="text-lg font-medium text-slate-900 mb-4">All Results</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th 
                      className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 rounded-lg transition-colors duration-200"
                      onClick={() => handleSort('achieved_at')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Date</span>
                        {sortField === 'achieved_at' && (
                          <span className="text-blue-500">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 rounded-lg transition-colors duration-200"
                      onClick={() => handleSort('metric_value')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>{isTimeBased ? 'Distance' : 'Time'}</span>
                        {sortField === 'metric_value' && (
                          <span className="text-blue-500">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-slate-700 hidden sm:table-cell">
                      Pace (/500m)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDetailData.map((attempt, index) => (
                    <tr 
                      key={attempt.id} 
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors duration-200 ${
                        isAllTimeRecord(attempt) ? 'bg-gradient-to-r from-amber-50 to-yellow-50' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          {isAllTimeRecord(attempt) && (
                            <Trophy className="w-4 h-4 text-amber-500" />
                          )}
                          <span className="text-slate-900">{formatDate(attempt.achieved_at)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-medium ${isAllTimeRecord(attempt) ? 'text-amber-900' : 'text-slate-900'}`}>
                          {formatPBValue(attempt)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 hidden sm:table-cell">
                        {displayPace(attempt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Table View
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-lg">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Personal Bests</h2>
              <p className="text-sm text-slate-600">
                Your best {selectedSport ? SPORT_MAPPING[selectedSport].toLowerCase() : ''} performances across all events
              </p>
            </div>
          </div>
          
          {/* Period Filter Dropdown */}
          {availablePeriods.length > 1 && (
            <div className="relative">
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="appearance-none bg-white border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
              >
                {availablePeriods.map(period => (
                  <option key={period} value={period}>
                    {formatPeriodDisplay(period)}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>
      </div>
      
      <div className="p-6">
        {filteredPRStats.length === 0 ? (
          <div className="text-center py-8">
            <Trophy className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Personal Bests</h3>
            <p className="text-slate-600">
              No records found for the selected period.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-4 px-4 font-semibold text-slate-800 bg-slate-50 rounded-tl-lg">
                    Event
                  </th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-800 bg-slate-50">
                    {getPBColumnHeader()}
                  </th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-800 bg-slate-50 hidden sm:table-cell">
                    Average Pace (/500m)
                  </th>
                  <th className="text-left py-4 px-4 font-semibold text-slate-800 bg-slate-50 rounded-tr-lg">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPRStats.map((stat, index) => {
                  const iconAndColors = getEventIconAndColor(stat.activity_key);
                  const showTrophy = shouldShowTrophy(stat);
                  
                  return (
                    <tr 
                      key={stat.activity_key} 
                      className="border-b border-slate-100 hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50 cursor-pointer transition-all duration-200 group"
                      onClick={() => handleRowClick(stat)}
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-3">
                          {/* Hide icon on mobile (sm and below), show on larger screens */}
                          <div className={`p-2 ${iconAndColors.bg} ${iconAndColors.border} border rounded-lg group-hover:scale-110 transition-transform duration-200 hidden sm:block`}>
                            <div className={iconAndColors.iconColor}>
                              {iconAndColors.icon}
                            </div>
                          </div>
                          <span className="font-medium text-slate-900 group-hover:text-blue-700 transition-colors duration-200">
                            {stat.activity_name}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2">
                          {showTrophy && (
                            <Trophy className="w-4 h-4 text-amber-500" />
                          )}
                          <span className="text-slate-900 font-medium">
                            {stat.selectedRecord && formatPBValue(stat.selectedRecord)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-600 hidden sm:table-cell">
                        <span className="px-2 py-1 bg-slate-100 rounded-md text-sm font-mono">
                          {stat.selectedRecord ? displayPace(stat.selectedRecord) : 'N/A'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-600">
                        {stat.selectedRecord && formatDate(stat.selectedRecord.achieved_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};