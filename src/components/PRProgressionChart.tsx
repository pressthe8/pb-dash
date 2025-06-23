import React, { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { PREvent } from '../types/personalRecords';
import { formatTime } from '../utils/timeFormatting';
import { Trophy, TrendingUp } from 'lucide-react';

interface PRProgressionChartProps {
  events: PREvent[];
  activityName: string;
  activityKey: string;
}

export const PRProgressionChart: React.FC<PRProgressionChartProps> = ({
  events,
  activityName,
  activityKey
}) => {
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

  // Prepare chart data using pace for consistency
  const chartData = useMemo(() => {
    if (!events || events.length === 0) return [];

    // Sort events by date
    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.achieved_at).getTime() - new Date(b.achieved_at).getTime()
    );

    // Get profile setting from localStorage (set by ProfilePage)
    const profileSeasonView = localStorage.getItem('pr_view_mode') === 'season';

    // Create data points for the chart using pace
    const dataPoints = sortedEvents
      .filter(event => event.pace_per_500m !== null) // Only include events with pace data
      .map((event, index) => {
        const eventDate = new Date(event.achieved_at);
        const isAllTime = event.pr_scope.includes('all-time');
        
        // Determine if this is an intermediate PR based on profile settings
        let isIntermediatePR = false;
        let intermediatePRLabel = '';
        
        if (profileSeasonView) {
          // Check for season PR
          const seasonScope = event.pr_scope.find(scope => scope.startsWith('season-'));
          if (seasonScope && !isAllTime) {
            isIntermediatePR = true;
            const seasonId = seasonScope.split('-')[1];
            intermediatePRLabel = `${formatSeasonDisplay(seasonId)} PB`;
          }
        } else {
          // Check for year PR
          const yearScope = event.pr_scope.find(scope => scope.startsWith('year-'));
          if (yearScope && !isAllTime) {
            isIntermediatePR = true;
            const year = yearScope.split('-')[1];
            intermediatePRLabel = `${year} PB`;
          }
        }

        return {
          x: eventDate.toISOString().split('T')[0], // YYYY-MM-DD format
          y: event.pace_per_500m! / 10, // Convert tenths to seconds for display
          event: event,
          isAllTime: isAllTime,
          isIntermediatePR: isIntermediatePR,
          intermediatePRLabel: intermediatePRLabel
        };
      });

    return [
      {
        id: 'pace-progression',
        data: dataPoints
      }
    ];
  }, [events]);

  // Advanced axis configuration based on data span and density
  const getAxisConfiguration = useMemo(() => {
    if (!chartData[0] || chartData[0].data.length === 0) {
      return {
        format: '%b %Y',
        tickValues: 'every 2 months',
        legend: 'Date',
        legendOffset: 46,
        legendPosition: 'middle' as const
      };
    }

    const dataPoints = chartData[0].data;
    const dataCount = dataPoints.length;
    
    // Calculate time span
    const firstDate = new Date(dataPoints[0].x);
    const lastDate = new Date(dataPoints[dataPoints.length - 1].x);
    const timeSpanYears = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    
    // Detect mobile
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    
    // Smart tick configuration based on time span and data density
    let config;
    
    if (timeSpanYears > 5) {
      // Long time span (5+ years): Show years only
      config = {
        format: '%Y',
        tickValues: isMobile ? 'every 2 years' : 'every 1 year',
        legend: 'Year',
        legendOffset: isMobile ? 50 : 46,
        legendPosition: 'middle' as const
      };
    } else if (timeSpanYears > 2) {
      // Medium time span (2-5 years): Show every 6 months
      config = {
        format: '%b %Y',
        tickValues: isMobile ? 'every 1 year' : 'every 6 months',
        legend: 'Date',
        legendOffset: isMobile ? 50 : 46,
        legendPosition: 'middle' as const
      };
    } else if (timeSpanYears > 1) {
      // Short-medium time span (1-2 years): Show every 3 months
      config = {
        format: '%b %Y',
        tickValues: isMobile ? 'every 6 months' : 'every 3 months',
        legend: 'Date',
        legendOffset: isMobile ? 50 : 46,
        legendPosition: 'middle' as const
      };
    } else {
      // Short time span (<1 year): Show monthly
      config = {
        format: '%b %Y',
        tickValues: isMobile ? 'every 2 months' : 'every 1 month',
        legend: 'Date',
        legendOffset: isMobile ? 50 : 46,
        legendPosition: 'middle' as const
      };
    }
    
    // Add rotation for mobile if we have many ticks
    if (isMobile && (dataCount > 6 || timeSpanYears > 1)) {
      config.tickRotation = -45;
      config.legendOffset = 60; // More space for rotated labels
    }
    
    return config;
  }, [chartData]);

  // Smart vertical axis configuration based on data range and screen size
  const getVerticalAxisConfiguration = useMemo(() => {
    if (!chartData[0] || chartData[0].data.length === 0) {
      return {
        tickValues: 5, // Default to 5 ticks
        legend: 'Pace per 500m',
        legendOffset: -60,
        legendPosition: 'middle' as const,
        format: formatPaceAxis
      };
    }

    const dataPoints = chartData[0].data;
    const paceValues = dataPoints.map(point => point.y);
    const minPace = Math.min(...paceValues);
    const maxPace = Math.max(...paceValues);
    const paceRange = maxPace - minPace;
    
    // Detect mobile
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    
    // Calculate optimal number of ticks based on range and screen size
    let tickCount;
    
    if (paceRange <= 5) {
      // Small range (5 seconds or less): More ticks are fine
      tickCount = isMobile ? 4 : 6;
    } else if (paceRange <= 15) {
      // Medium range (5-15 seconds): Moderate number of ticks
      tickCount = isMobile ? 3 : 5;
    } else if (paceRange <= 30) {
      // Large range (15-30 seconds): Fewer ticks
      tickCount = isMobile ? 3 : 4;
    } else {
      // Very large range (30+ seconds): Minimal ticks
      tickCount = isMobile ? 2 : 3;
    }
    
    return {
      tickValues: tickCount,
      legend: 'Pace per 500m',
      legendOffset: isMobile ? -50 : -60,
      legendPosition: 'middle' as const,
      format: formatPaceAxis
    };
  }, [chartData]);

  // Responsive margins
  const responsiveMargins = useMemo(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const hasRotatedLabels = getAxisConfiguration.tickRotation === -45;
    
    return {
      top: 20,
      right: 20,
      bottom: hasRotatedLabels ? 80 : (isMobile ? 70 : 60),
      left: isMobile ? 60 : 80
    };
  }, [getAxisConfiguration]);

  // Custom points layer function
  const CustomPointsLayer = ({ points, xScale, yScale }: any) => {
    return (
      <g>
        {points.map((point: any) => {
          const data = point.data;
          const isAllTime = data.isAllTime;
          const isIntermediatePR = data.isIntermediatePR;
          
          if (isAllTime) {
            // All-time PB: Large gold point with white center
            return (
              <g key={point.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={10}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth={3}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={5}
                  fill="#ffffff"
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={2}
                  fill="#f59e0b"
                />
              </g>
            );
          } else if (isIntermediatePR) {
            // Intermediate PR (season/year): Medium blue point
            return (
              <circle
                key={point.id}
                cx={point.x}
                cy={point.y}
                r={8}
                fill="#3b82f6"
                stroke="#ffffff"
                strokeWidth={3}
              />
            );
          } else {
            // Regular attempt: Smaller gray point
            return (
              <circle
                key={point.id}
                cx={point.x}
                cy={point.y}
                r={6}
                fill="#94a3b8"
                stroke="#ffffff"
                strokeWidth={2}
              />
            );
          }
        })}
      </g>
    );
  };

  // Custom tooltip
  const CustomTooltip = ({ point }: any) => {
    const data = point.data;
    const event = data.event;
    
    // Format the main metric value
    const formatMainValue = (event: PREvent): string => {
      if (event.metric_type === 'time') {
        return formatTime(event.metric_value);
      } else {
        return `${event.metric_value.toLocaleString()}m`;
      }
    };
    
    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
        <div className="flex items-center space-x-2 mb-2">
          {data.isAllTime && <Trophy className="w-4 h-4 text-amber-500" />}
          {data.isIntermediatePR && !data.isAllTime && <TrendingUp className="w-4 h-4 text-blue-500" />}
          <span className="font-medium text-slate-900">
            {formatMainValue(event)}
          </span>
        </div>
        <div className="text-sm text-slate-600">
          {new Date(event.achieved_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Pace: {formatTime(event.pace_per_500m!)}/500m
        </div>
        {data.isAllTime && (
          <div className="text-xs text-amber-600 mt-1 font-medium">
            All-Time PB
          </div>
        )}
        {data.isIntermediatePR && !data.isAllTime && (
          <div className="text-xs text-blue-600 mt-1 font-medium">
            {data.intermediatePRLabel}
          </div>
        )}
      </div>
    );
  };

  // Format pace for axis labels
  const formatPaceAxis = (value: number): string => {
    return formatTime(Math.round(value * 10)); // Convert back to tenths for formatting
  };

  if (!events || events.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500">
        <div className="text-center">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 text-slate-400" />
          <p>No progression data available</p>
        </div>
      </div>
    );
  }

  // Filter events with pace data
  const eventsWithPace = events.filter(event => event.pace_per_500m !== null);
  
  if (eventsWithPace.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500">
        <div className="text-center">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 text-slate-400" />
          <p>No pace data available</p>
          <p className="text-xs text-slate-400 mt-1">Pace data is calculated for newer results</p>
        </div>
      </div>
    );
  }

  if (eventsWithPace.length === 1) {
    const event = eventsWithPace[0];
    return (
      <div className="h-64 flex items-center justify-center text-slate-500">
        <div className="text-center">
          <Trophy className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="font-medium text-slate-700">Single Result</p>
          <p className="text-sm">Pace: {formatTime(event.pace_per_500m!)}/500m</p>
          <p className="text-xs text-slate-500 mt-1">
            {new Date(event.achieved_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveLine
        data={chartData}
        margin={responsiveMargins}
        xScale={{
          type: 'time',
          format: '%Y-%m-%d',
          useUTC: false,
          precision: 'day',
        }}
        xFormat="time:%Y-%m-%d"
        yScale={{
          type: 'linear',
          min: 'auto',
          max: 'auto',
          reverse: true, // Lower pace is better, so reverse the scale
        }}
        curve="monotoneX"
        axisTop={null}
        axisRight={null}
        axisBottom={getAxisConfiguration}
        axisLeft={getVerticalAxisConfiguration}
        layers={[
          'grid',
          'markers',
          'axes',
          'areas',
          'crosshair',
          'lines',
          // 'points', ← Remove default points layer
          'slices',
          CustomPointsLayer, // ← Add our custom points layer here
          'mesh',
          'legends'
        ]}
        pointSize={0} // Disable default points entirely
        enablePointLabel={false}
        useMesh={true}
        tooltip={CustomTooltip}
        theme={{
          axis: {
            ticks: {
              text: {
                fontSize: typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 12,
                fill: '#64748b'
              }
            },
            legend: {
              text: {
                fontSize: typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 12,
                fill: '#475569',
                fontWeight: 500
              }
            }
          },
          grid: {
            line: {
              stroke: '#e2e8f0',
              strokeWidth: 1
            }
          }
        }}
        colors={['#3b82f6']}
        lineWidth={3}
        enableArea={false}
        animate={true}
        motionConfig="gentle"
      />
    </div>
  );
};