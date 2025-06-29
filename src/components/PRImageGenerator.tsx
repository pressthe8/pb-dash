import React, { useState, useRef } from 'react';
import { Download, Share2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { PRStats, SportType, SPORT_MAPPING } from '../types/personalRecords';
import { formatTime } from '../utils/timeFormatting';

interface PRImageGeneratorProps {
  prStats: PRStats[];
  selectedSport: SportType;
  userDisplayName?: string;
}

interface EventConfig {
  key: string;
  label: string;
  isTimeEvent: boolean;
  displayOrder: number;
}

// Event configurations for each sport with proper display order - ADDED MISSING 1min and 4min
const SPORT_EVENTS: Record<SportType, EventConfig[]> = {
  rower: [
    { key: '100m_row', label: '100m', isTimeEvent: false, displayOrder: 1 },
    { key: '500m_row', label: '500m', isTimeEvent: false, displayOrder: 2 },
    { key: '1k_row', label: '1K', isTimeEvent: false, displayOrder: 3 },
    { key: '2k_row', label: '2K', isTimeEvent: false, displayOrder: 4 },
    { key: '5k_row', label: '5K', isTimeEvent: false, displayOrder: 5 },
    { key: '6k_row', label: '6K', isTimeEvent: false, displayOrder: 6 },
    { key: '10k_row', label: '10K', isTimeEvent: false, displayOrder: 7 },
    { key: '1min_row', label: '1min', isTimeEvent: true, displayOrder: 8 },
    { key: '4min_row', label: '4min', isTimeEvent: true, displayOrder: 9 },
    { key: '30min_row', label: '30min', isTimeEvent: true, displayOrder: 10 },
    { key: '60min_row', label: '60min', isTimeEvent: true, displayOrder: 11 },
    { key: 'half_marathon_row', label: 'HM', isTimeEvent: false, displayOrder: 12 },
    { key: 'marathon_row', label: 'FM', isTimeEvent: false, displayOrder: 13 },
  ],
  bike: [
    { key: '100m_bike', label: '100m', isTimeEvent: false, displayOrder: 1 },
    { key: '500m_bike', label: '500m', isTimeEvent: false, displayOrder: 2 },
    { key: '1k_bike', label: '1K', isTimeEvent: false, displayOrder: 3 },
    { key: '2k_bike', label: '2K', isTimeEvent: false, displayOrder: 4 },
    { key: '5k_bike', label: '5K', isTimeEvent: false, displayOrder: 5 },
    { key: '10k_bike', label: '10K', isTimeEvent: false, displayOrder: 6 },
    { key: '1min_bike', label: '1min', isTimeEvent: true, displayOrder: 7 },
    { key: '4min_bike', label: '4min', isTimeEvent: true, displayOrder: 8 },
    { key: '30min_bike', label: '30min', isTimeEvent: true, displayOrder: 9 },
    { key: '60min_bike', label: '60min', isTimeEvent: true, displayOrder: 10 },
  ],
  skierg: [
    { key: '100m_ski', label: '100m', isTimeEvent: false, displayOrder: 1 },
    { key: '500m_ski', label: '500m', isTimeEvent: false, displayOrder: 2 },
    { key: '1k_ski', label: '1K', isTimeEvent: false, displayOrder: 3 },
    { key: '2k_ski', label: '2K', isTimeEvent: false, displayOrder: 4 },
    { key: '5k_ski', label: '5K', isTimeEvent: false, displayOrder: 5 },
    { key: '10k_ski', label: '10K', isTimeEvent: false, displayOrder: 6 },
    { key: '1min_ski', label: '1min', isTimeEvent: true, displayOrder: 7 },
    { key: '4min_ski', label: '4min', isTimeEvent: true, displayOrder: 8 },
    { key: '30min_ski', label: '30min', isTimeEvent: true, displayOrder: 9 },
    { key: '60min_ski', label: '60min', isTimeEvent: true, displayOrder: 10 },
  ],
};

export const PRImageGenerator: React.FC<PRImageGeneratorProps> = ({
  prStats,
  selectedSport,
  userDisplayName = 'Athlete'
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Get current season identifier
  const getCurrentSeason = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-based
    const seasonEndYear = month < 4 ? year : year + 1;
    const seasonStartYear = seasonEndYear - 1;
    return `${seasonStartYear.toString().slice(-2)}/${seasonEndYear.toString().slice(-2)}`;
  };

  // DYNAMIC FILTERING: Get only events that have data
  const getAvailableEvents = (): EventConfig[] => {
    const allEvents = SPORT_EVENTS[selectedSport];
    const availableEvents = allEvents.filter(event => {
      // Check if we have a stat for this event
      const stat = prStats.find(stat => stat.activity_key === event.key);
      return stat && stat.all_time_record; // Only include if there's an all-time record
    });
    
    // Sort by display order to maintain consistent ordering
    return availableEvents.sort((a, b) => a.displayOrder - b.displayOrder);
  };

  // Format value based on event type
  const formatValue = (stat: PRStats, eventConfig: EventConfig, isSeasonRecord: boolean = false): string => {
    const record = isSeasonRecord ? stat.current_season_record : stat.all_time_record;
    if (!record) return '-';

    if (eventConfig.isTimeEvent) {
      // Time events show distance achieved - Show in metres
      return `${record.metric_value}m`;
    } else {
      // Distance events show time taken
      return formatTime(record.metric_value);
    }
  };

  // Format date as DD/MM/YY
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${day}/${month}/${year}`;
  };

  // Get stat for specific event
  const getStatForEvent = (eventKey: string): PRStats | null => {
    return prStats.find(stat => stat.activity_key === eventKey) || null;
  };

  const generateImage = async () => {
    setIsGenerating(true);
    
    try {
      // DYNAMIC: Get only events with data
      const availableEvents = getAvailableEvents();
      const currentSeason = getCurrentSeason();

      // DYNAMIC SIZING: Calculate dimensions based on number of available events
      const maxWidth = 650;
      const cellHeight = 12;
      const pbCellWidth = 50; // Fixed width for PB column
      
      // Calculate event cell width based on available events
      const availableWidth = maxWidth - pbCellWidth;
      const eventCellWidth = Math.floor(availableWidth / availableEvents.length);
      const totalWidth = pbCellWidth + (availableEvents.length * eventCellWidth);
      const totalHeight = cellHeight * 4; // 4 rows

      console.log(`Dynamic canvas dimensions: ${totalWidth}x${totalHeight} for ${availableEvents.length} events (target: max 650px width)`);

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = totalWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d')!;

      // Use Verdana font only - optimized for small sizes and screen readability
      const fontSize = 7;
      const fontFamily = 'Verdana, Geneva, sans-serif';
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Enable text smoothing for better quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Helper function to draw cell with border and background
      const drawCell = (x: number, y: number, width: number, height: number, text: string, bgColor: string, isBold: boolean = false) => {
        // Fill background
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, width, height);
        
        // Draw border with sharper lines
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
        
        // Draw text
        ctx.fillStyle = '#000000';
        ctx.font = isBold ? `bold ${fontSize}px ${fontFamily}` : `${fontSize}px ${fontFamily}`;
        
        // Use Math.round for pixel-perfect positioning
        ctx.fillText(text, Math.round(x + width/2), Math.round(y + height/2));
      };

      // Row 1: Headers
      let currentX = 0;
      drawCell(currentX, 0, pbCellWidth, cellHeight, 'PB', '#e6f3ff', true);
      currentX += pbCellWidth;

      availableEvents.forEach((event, index) => {
        const bgColor = index % 2 === 0 ? '#e6f3ff' : '#f0f8ff';
        drawCell(currentX, 0, eventCellWidth, cellHeight, event.label, bgColor, true);
        currentX += eventCellWidth;
      });

      // Row 2: Records
      currentX = 0;
      drawCell(currentX, cellHeight, pbCellWidth, cellHeight, 'Record', '#ffffff', true);
      currentX += pbCellWidth;

      availableEvents.forEach((event, index) => {
        const stat = getStatForEvent(event.key);
        const value = stat ? formatValue(stat, event) : '-';
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f8f8';
        drawCell(currentX, cellHeight, eventCellWidth, cellHeight, value, bgColor, true);
        currentX += eventCellWidth;
      });

      // Row 3: Dates
      currentX = 0;
      drawCell(currentX, cellHeight * 2, pbCellWidth, cellHeight, 'Date', '#ffffff', true);
      currentX += pbCellWidth;

      availableEvents.forEach((event, index) => {
        const stat = getStatForEvent(event.key);
        const date = stat?.all_time_record ? formatDate(stat.all_time_record.achieved_at) : '-';
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f8f8';
        drawCell(currentX, cellHeight * 2, eventCellWidth, cellHeight, date, bgColor, false);
        currentX += eventCellWidth;
      });

      // Row 4: Season Records
      currentX = 0;
      drawCell(currentX, cellHeight * 3, pbCellWidth, cellHeight, currentSeason, '#e6f3ff', true);
      currentX += pbCellWidth;

      availableEvents.forEach((event, index) => {
        const stat = getStatForEvent(event.key);
        const value = stat ? formatValue(stat, event, true) : '-';
        const bgColor = index % 2 === 0 ? '#e6f3ff' : '#f0f8ff';
        drawCell(currentX, cellHeight * 3, eventCellWidth, cellHeight, value, bgColor, false);
        currentX += eventCellWidth;
      });

      const imageUrl = canvas.toDataURL('image/png');
      setGeneratedImageUrl(imageUrl);
      
      console.log(`Dynamic image generated: ${canvas.width}x${canvas.height} with ${availableEvents.length} events using Verdana font`);
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!generatedImageUrl) return;

    const link = document.createElement('a');
    const cleanName = userDisplayName.replace(/\s+/g, '_').toLowerCase();
    link.download = `${cleanName}_pbdash_export.png`;
    link.href = generatedImageUrl;
    link.click();
  };

  const copyToClipboard = async () => {
    if (!generatedImageUrl) return;

    try {
      const response = await fetch(generatedImageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  // DYNAMIC: Get available events for preview
  const availableEvents = getAvailableEvents();
  const currentSeason = getCurrentSeason();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-6 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Generate PB Image (Beta)</h2>
              <p className="text-sm text-slate-600">
                Create a shareable image of your personal bests ({availableEvents.length} events with data)
              </p>
            </div>
          </div>
          
          {/* Mobile-optimized button layout */}
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
            {!generatedImageUrl ? (
              // Show only Generate button when no image exists
              <button
                onClick={generateImage}
                disabled={isGenerating || availableEvents.length === 0}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
                <span className="text-sm">
                  {isGenerating ? 'Generating...' : availableEvents.length === 0 ? 'No Data Available' : 'Generate Image'}
                </span>
              </button>
            ) : (
              // Show action buttons when image exists
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center justify-center space-x-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors duration-200"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="text-sm">Copy</span>
                </button>
                <button
                  onClick={downloadImage}
                  className="flex items-center justify-center space-x-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200"
                >
                  <Download className="w-4 h-4" />
                  <span className="text-sm">Download</span>
                </button>
                {/* Regenerate button - smaller and less prominent */}
                <button
                  onClick={generateImage}
                  disabled={isGenerating}
                  className="flex items-center justify-center space-x-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ImageIcon className="w-3 h-3" />
                  )}
                  <span className="text-xs">Regenerate</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Show message if no events available */}
        {availableEvents.length === 0 && (
          <div className="text-center py-8">
            <ImageIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Personal Bests Available</h3>
            <p className="text-slate-600">
              Complete some {SPORT_MAPPING[selectedSport].toLowerCase()} workouts to generate your PB image.
            </p>
          </div>
        )}

        {/* Generated Image Preview - Show first when available */}
        {generatedImageUrl && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Generated Image</h3>
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <img 
                src={generatedImageUrl} 
                alt="Generated PB Image" 
                className="max-w-full h-auto rounded-lg shadow-sm"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          </div>
        )}

        {/* Preview Table - Only show when we have events and (no image generated or on larger screens) */}
        {availableEvents.length > 0 && (!generatedImageUrl || window.innerWidth >= 640) && (
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="text-sm font-medium text-slate-700 mb-3">
              Preview ({availableEvents.length} events)
            </h3>
            <div className="bg-white p-2 rounded border text-xs overflow-x-auto">
              <table className="w-full border-collapse">
                {/* Row 1: Event Headers */}
                <tr className="bg-blue-50">
                  <td className="py-1 px-2 font-bold text-center border border-slate-400 w-16">PB</td>
                  {availableEvents.map((event, index) => (
                    <td key={event.key} className={`py-1 px-2 font-bold text-center border border-slate-400 ${index % 2 === 0 ? 'bg-blue-50' : 'bg-blue-100'}`}>
                      {event.label}
                    </td>
                  ))}
                </tr>

                {/* Row 2: Record Values */}
                <tr>
                  <td className="py-1 px-2 font-bold text-center border border-slate-400">Record</td>
                  {availableEvents.map((event, index) => {
                    const stat = getStatForEvent(event.key);
                    return (
                      <td key={event.key} className={`py-1 px-2 font-bold text-center border border-slate-400 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        {stat ? formatValue(stat, event) : '-'}
                      </td>
                    );
                  })}
                </tr>

                {/* Row 3: Dates */}
                <tr>
                  <td className="py-1 px-2 font-bold text-center border border-slate-400">Date</td>
                  {availableEvents.map((event, index) => {
                    const stat = getStatForEvent(event.key);
                    return (
                      <td key={event.key} className={`py-1 px-2 text-center border border-slate-400 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        {stat?.all_time_record ? formatDate(stat.all_time_record.achieved_at) : '-'}
                      </td>
                    );
                  })}
                </tr>

                {/* Row 4: Season Records */}
                <tr className="bg-blue-50">
                  <td className="py-1 px-2 font-bold text-center border border-slate-400">{currentSeason}</td>
                  {availableEvents.map((event, index) => {
                    const stat = getStatForEvent(event.key);
                    return (
                      <td key={event.key} className={`py-1 px-2 text-center border border-slate-400 ${index % 2 === 0 ? 'bg-blue-50' : 'bg-blue-100'}`}>
                        {stat ? formatValue(stat, event, true) : '-'}
                      </td>
                    );
                  })}
                </tr>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};