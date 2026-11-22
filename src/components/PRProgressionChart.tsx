import React, { useMemo } from 'react';
import { ResponsiveLine, type LineCustomSvgLayerProps, type PointTooltipProps } from '@nivo/line';
import { PREvent } from '../types/personalRecords';
import { formatTime } from '../utils/timeFormatting';
import { Trophy, TrendingUp } from 'lucide-react';
import { formatWorkoutDate, workoutCalendar } from '../../functions/src/workoutCalendar';

interface PRProgressionChartProps {
  events: PREvent[];
  seasonView?: boolean;
}

type ProgressionSeries = {
  id: string;
  data: { x: string; y: number; event: PREvent; isAllTime: boolean; isIntermediatePR: boolean; intermediatePRLabel: string }[];
};

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const formatMonthTick = (value: unknown) => value instanceof Date ? monthLabel.format(value) : String(value);
const formatYearTick = (value: unknown) => value instanceof Date ? String(value.getUTCFullYear()) : String(value);
const formatDay = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value);

export const PRProgressionChart: React.FC<PRProgressionChartProps> = ({ events, seasonView }) => {
  // Helper function to format season display
  const formatSeasonDisplay = (seasonId: string): string => {
    const endYear = parseInt(seasonId);
    const startYear = endYear - 1;
    return `${startYear}/${seasonId.slice(-2)}`;
  };

  // Format pace for axis labels - moved before useMemo hooks that reference it
  const formatPaceAxis = (value: number): string => {
    return formatTime(Math.round(value * 10)); // Convert back to tenths for formatting
  };

  // Prepare chart data using pace for consistency
  const chartData = useMemo<ProgressionSeries[]>(() => {
    if (!events || events.length === 0) return [];

    // Get profile setting from localStorage (set by ProfilePage)
    const profileSeasonView = seasonView ?? (localStorage.getItem('pr_view_mode') === 'season');

    const dataPoints = events.flatMap(event => {
      const calendar = workoutCalendar(event.achieved_at);
      return calendar && event.pace_per_500m !== null ? [{ event, calendar }] : [];
    }).sort((a, b) => a.calendar.sortKey.localeCompare(b.calendar.sortKey))
      .map(({ event, calendar }) => {
        const isAllTime = event.pr_scope.includes('all-time');
        const scope = profileSeasonView ? `season-${calendar.season}` : `year-${calendar.year}`;
        const isIntermediatePR = !isAllTime && event.pr_scope.includes(scope);
        const period = profileSeasonView ? formatSeasonDisplay(calendar.season) : calendar.year;

        return {
          x: calendar.day,
          y: event.pace_per_500m! / 10, // Convert tenths to seconds for display
          event,
          isAllTime,
          isIntermediatePR,
          intermediatePRLabel: `${period} PB`,
        };
      });

    return [
      {
        id: 'pace-progression',
        data: dataPoints
      }
    ];
  }, [events, seasonView]);

  // Advanced axis configuration based on data span and density
  const getAxisConfiguration = useMemo(() => {
    if (!chartData[0] || chartData[0].data.length === 0) {
      return {
        format: formatMonthTick,
        tickValues: 'every 2 months',
        tickRotation: 0,
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
        format: formatYearTick,
        tickValues: isMobile ? 'every 2 years' : 'every 1 year',
        legend: 'Year',
        legendOffset: isMobile ? 50 : 46,
        legendPosition: 'middle' as const
      };
    } else if (timeSpanYears > 2) {
      // Medium time span (2-5 years): Show every 6 months
      config = {
        format: formatMonthTick,
        tickValues: isMobile ? 'every 1 year' : 'every 6 months',
        legend: 'Date',
        legendOffset: isMobile ? 50 : 46,
        legendPosition: 'middle' as const
      };
    } else if (timeSpanYears > 1) {
      // Short-medium time span (1-2 years): Show every 3 months
      config = {
        format: formatMonthTick,
        tickValues: isMobile ? 'every 6 months' : 'every 3 months',
        legend: 'Date',
        legendOffset: isMobile ? 50 : 46,
        legendPosition: 'middle' as const
      };
    } else {
      // Short time span (<1 year): Show monthly
      config = {
        format: formatMonthTick,
        tickValues: isMobile ? 'every 2 months' : 'every 1 month',
        legend: 'Date',
        legendOffset: isMobile ? 50 : 46,
        legendPosition: 'middle' as const
      };
    }
    
    const rotateTicks = isMobile && (dataCount > 6 || timeSpanYears > 1);
    return { ...config, tickRotation: rotateTicks ? -45 : 0, legendOffset: rotateTicks ? 60 : config.legendOffset };
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
  const CustomPointsLayer = ({ points }: LineCustomSvgLayerProps<ProgressionSeries>) => {
    return (
      <g>
        {points.map((point) => {
          const data = point.data;
          const isAllTime = data.isAllTime;
          const isIntermediatePR = data.isIntermediatePR;
          
          if (isAllTime) {
            // All-time PB
            return (
              <g key={point.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={10}
                  fill="#dfff80"
                  stroke="#211b2e"
                  strokeWidth={3}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={5}
                  fill="#211b2e"
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={2}
                  fill="#dfff80"
                />
              </g>
            );
          } else if (isIntermediatePR) {
            // Season or calendar-year PB
            return (
              <circle
                key={point.id}
                cx={point.x}
                cy={point.y}
                r={8}
                fill="#bda4ff"
                stroke="#211b2e"
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
                fill="#a39ab5"
                stroke="#211b2e"
                strokeWidth={2}
              />
            );
          }
        })}
      </g>
    );
  };

  // Custom tooltip
  const CustomTooltip = ({ point }: PointTooltipProps<ProgressionSeries>) => {
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
      <div className="pb-chart-tooltip">
        <div className="flex items-center space-x-2 mb-2">
          {data.isAllTime && <Trophy className="w-4 h-4 text-[var(--pb-lime)]" />}
          {data.isIntermediatePR && !data.isAllTime && <TrendingUp className="w-4 h-4 text-[#bda4ff]" />}
          <span className="font-medium text-[var(--pb-text)]">
            {formatMainValue(event)}
          </span>
        </div>
        <div className="text-sm text-[var(--pb-muted)]">
          {formatWorkoutDate(event.achieved_at)}
        </div>
        <div className="text-xs text-[var(--pb-muted)] mt-1">
          Pace: {formatTime(event.pace_per_500m!)}/500m
        </div>
        {data.isAllTime && (
          <div className="text-xs text-[var(--pb-lime)] mt-1 font-medium">
            All-Time PB
          </div>
        )}
        {data.isIntermediatePR && !data.isAllTime && (
          <div className="text-xs text-[#bda4ff] mt-1 font-medium">
            {data.intermediatePRLabel}
          </div>
        )}
      </div>
    );
  };

  if (!events || events.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-[var(--pb-muted)]">
        <div className="text-center">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 text-[var(--pb-muted)]" />
          <p>No progression data available</p>
        </div>
      </div>
    );
  }

  const dataPoints = chartData[0]?.data ?? [];
  if (dataPoints.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-[var(--pb-muted)]">
        <div className="text-center">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 text-[var(--pb-muted)]" />
          <p>No pace data available</p>
          <p className="text-xs text-[var(--pb-muted)] mt-1">Pace data is calculated for newer results</p>
        </div>
      </div>
    );
  }

  if (dataPoints.length === 1) {
    const { event } = dataPoints[0];
    return (
      <div className="h-64 flex items-center justify-center text-[var(--pb-muted)]">
        <div className="text-center">
          <Trophy className="w-8 h-8 mx-auto mb-2 text-[var(--pb-lime)]" />
          <p className="font-medium text-[var(--pb-text)]">Single Result</p>
          <p className="text-sm">Pace: {formatTime(event.pace_per_500m!)}/500m</p>
          <p className="text-xs text-[var(--pb-muted)] mt-1">
            {formatWorkoutDate(event.achieved_at)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveLine<ProgressionSeries>
        data={chartData}
        margin={responsiveMargins}
        xScale={{
          type: 'time',
          format: '%Y-%m-%d',
          // Plot calendar days on a UTC scale so browser offsets and DST cannot shift them.
          useUTC: true,
          precision: 'day',
        }}
        xFormat={formatDay}
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
                fill: '#bbb0cd'
              }
            },
            legend: {
              text: {
                fontSize: typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 12,
                fill: '#d6cce4',
                fontWeight: 500
              }
            }
          },
          grid: {
            line: {
              stroke: '#483c59',
              strokeWidth: 1
            }
          }
        }}
        colors={['#bda4ff']}
        lineWidth={3}
        enableArea={false}
        animate={true}
        motionConfig="gentle"
      />
    </div>
  );
};
