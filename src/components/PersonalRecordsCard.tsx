import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Calendar, Clock, Ruler, TrendingUp, ChevronDown } from 'lucide-react';
import { PRStats, PREvent } from '../types/personalRecords';
import { formatTime } from '../utils/timeFormatting';

interface PersonalRecordsCardProps {
  prStats: PRStats[];
  loading: boolean;
  allPREvents: PREvent[];
}

type ViewMode = 'season' | 'year';

export const PersonalRecordsCard: React.FC<PersonalRecordsCardProps> = ({ 
  prStats, 
  loading,
  allPREvents
}) => {
  // State management with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('pr_view_mode');
    return (saved as ViewMode) || 'season';
  });

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

  // Get available periods from PR events and set default immediately
  const { availablePeriods, defaultPeriod } = useMemo(() => {
    if (!allPREvents || allPREvents.length === 0) {
      return { availablePeriods: [], defaultPeriod: '' };
    }

    const periods = new Set<string>();
    
    allPREvents.forEach(event => {
      if (viewMode === 'year') {
        const year = new Date(event.achieved_at).getFullYear().toString();
        periods.add(year);
      } else {
        // Use season_identifier from the event
        periods.add(event.season_identifier);
      }
    });

    const sortedPeriods = Array.from(periods).sort((a, b) => {
      return parseInt(b) - parseInt(a); // Descending order (newest first)
    });

    // Set default period immediately based on current date and available periods
    let defaultPeriod = '';
    if (sortedPeriods.length > 0) {
      if (viewMode === 'year') {
        const currentYear = new Date().getFullYear().toString();
        defaultPeriod = sortedPeriods.includes(currentYear) ? currentYear : sortedPeriods[0];
      } else {
        const currentSeason = getSeasonIdentifier(new Date());
        defaultPeriod = sortedPeriods.includes(currentSeason) ? currentSeason : sortedPeriods[0];
      }
    }

    return { availablePeriods: sortedPeriods, defaultPeriod };
  }, [allPREvents, viewMode]);

  // Initialize selectedPeriod with the calculated default
  const [selectedPeriod, setSelectedPeriod] = useState<string>(defaultPeriod);

  // Update selectedPeriod when defaultPeriod changes (due to viewMode change)
  useEffect(() => {
    setSelectedPeriod(defaultPeriod);
  }, [defaultPeriod]);

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem('pr_view_mode', viewMode);
  }, [viewMode]);

  // Enhanced stats with period-specific records
  const enhancedStats = useMemo(() => {
    if (!selectedPeriod) return prStats;

    return prStats.map(stat => {
      // Find the record for the selected period
      const periodRecord = allPREvents.find(event => {
        if (event.activity_key !== stat.activity_key) return false;
        
        if (viewMode === 'year') {
          const eventYear = new Date(event.achieved_at).getFullYear().toString();
          return eventYear === selectedPeriod && event.pr_scope.includes(`year-${selectedPeriod}`);
        } else {
          return event.season_identifier === selectedPeriod && event.pr_scope.includes(`season-${selectedPeriod}`);
        }
      });

      return {
        ...stat,
        selected_period_record: periodRecord || null
      };
    });
  }, [prStats, allPREvents, selectedPeriod, viewMode]);

  // Updated formatDistance function to always show meters
  const formatDistance = (meters: number) => {
    // Always show in meters with comma separator for thousands
    return `${meters.toLocaleString()}m`;
  };

  const formatMetricValue = (value: number, metricType: string) => {
    return metricType === 'time' ? formatTime(value) : formatDistance(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
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
          <Trophy className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No Personal Bests Yet</h3>
          <p className="text-slate-600">
            Complete some standard distance or time workouts to start tracking your PBs.
          </p>
        </div>
      </div>
    );
  }

  // Filter to show only activities with records
  const activitiesWithRecords = enhancedStats.filter(stat => 
    stat.all_time_record || stat.selected_period_record
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Personal Bests</h2>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Period Filter Dropdown */}
            {availablePeriods.length > 0 && (
              <div className="relative">
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="appearance-none bg-white border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {availablePeriods.map(period => (
                    <option key={period} value={period}>
                      {viewMode === 'year' ? period : formatSeasonDisplay(period)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-6">
        {activitiesWithRecords.length === 0 ? (
          <div className="text-center py-8">
            <Trophy className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Personal Bests Yet</h3>
            <p className="text-slate-600">
              Complete some standard distance or time workouts to start tracking your PBs.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {activitiesWithRecords.map((stat) => (
              <div key={stat.activity_key} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">{stat.activity_name}</h3>
                  <div className="text-sm text-slate-500">
                    {stat.total_attempts} attempt{stat.total_attempts !== 1 ? 's' : ''}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* All-Time Record */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 p-3 rounded-lg border border-amber-200">
                    <div className="flex items-center space-x-2 mb-2">
                      <Trophy className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-800">All-Time</span>
                    </div>
                    {stat.all_time_record ? (
                      <div>
                        <div className="text-lg font-bold text-amber-900">
                          {formatMetricValue(stat.all_time_record.metric_value, stat.all_time_record.metric_type)}
                        </div>
                        <div className="text-xs text-amber-700">
                          {formatDate(stat.all_time_record.achieved_at)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-amber-600">No record</div>
                    )}
                  </div>

                  {/* Selected Period Record */}
                  <div className={`p-3 rounded-lg border ${
                    viewMode === 'season' 
                      ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
                      : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
                  }`}>
                    <div className="flex items-center space-x-2 mb-2">
                      {viewMode === 'season' ? (
                        <Calendar className="w-4 h-4 text-blue-600" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-green-600" />
                      )}
                      <span className={`text-sm font-medium ${
                        viewMode === 'season' ? 'text-blue-800' : 'text-green-800'
                      }`}>
                        {viewMode === 'season' 
                          ? `Season ${formatSeasonDisplay(selectedPeriod)}`
                          : `Year ${selectedPeriod}`
                        }
                      </span>
                    </div>
                    {(stat as any).selected_period_record ? (
                      <div>
                        <div className={`text-lg font-bold ${
                          viewMode === 'season' ? 'text-blue-900' : 'text-green-900'
                        }`}>
                          {formatMetricValue(
                            (stat as any).selected_period_record.metric_value, 
                            (stat as any).selected_period_record.metric_type
                          )}
                        </div>
                        <div className={`text-xs ${
                          viewMode === 'season' ? 'text-blue-700' : 'text-green-700'
                        }`}>
                          {formatDate((stat as any).selected_period_record.achieved_at)}
                        </div>
                      </div>
                    ) : (
                      <div className={`text-sm ${
                        viewMode === 'season' ? 'text-blue-600' : 'text-green-600'
                      }`}>
                        No record
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};