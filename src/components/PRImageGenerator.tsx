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

  // Format value based on event type - FIXED: Time events now show metres instead of km
  const formatValue = (stat: PRStats, eventConfig: EventConfig, isSeasonRecord: boolean = false): string => {
    const record = isSeasonRecord ? stat.current_season_record : stat.all_time_record;
    if (!record) return '-';

    if (eventConfig.isTimeEvent) {
      // Time events show distance achieved - FIXED: Show in metres, not km
      return `${record.metric_value}m`;
    } else {
      // Distance events show time taken
      return formatTime(record.metric_value);
    }
  };

  // Format date as DD/MM/YY - FIXED: Now includes day
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
      // Get events and sort by display order
      const events = SPORT_EVENTS[selectedSport].sort((a, b) => a.displayOrder - b.displayOrder);
      const currentSeason = getCurrentSeason();

      // Canvas dimensions - targeting 650x50 like your reference
      const cellWidth = 45;
      const cellHeight = 12;
      const pbCellWidth = 50; // Wider for PB column
      const totalWidth = pbCellWidth + (events.length * cellWidth);
      const totalHeight = cellHeight * 4; // 4 rows

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = totalWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d')!;

      // Set high DPI for crisp text
      const dpr = window.devicePixelRatio || 1;
      canvas.width = totalWidth * dpr;
      canvas.height = totalHeight * dpr;
      canvas.style.width = totalWidth + 'px';
      canvas.style.height = totalHeight + 'px';
      ctx.scale(dpr, dpr);

      // Font settings
      ctx.font = '8px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Helper function to draw cell with border and background
      const drawCell = (x: number, y: number, width: number, height: number, text: string, bgColor: string, isBold: boolean = false) => {
        // Fill background
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, width, height);
        
        // Draw border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);
        
        // Draw text
        ctx.fillStyle = '#000000';
        ctx.font = isBold ? 'bold 8px Arial, sans-serif' : '8px Arial, sans-serif';
        
        // Handle multi-line text for season cell (now just the season, no "SB")
        if (text.includes('\n')) {
          const lines = text.split('\n');
          const lineHeight = 4;
          const startY = y + height/2 - (lines.length - 1) * lineHeight/2;
          lines.forEach((line, index) => {
            ctx.fillText(line, x + width/2, startY + index * lineHeight);
          });
        } else {
          ctx.fillText(text, x + width/2, y + height/2);
        }
      };

      // Row 1: Headers
      let currentX = 0;
      drawCell(currentX, 0, pbCellWidth, cellHeight, 'PB', '#e6f3ff', true);
      currentX += pbCellWidth;

      events.forEach((event, index) => {
        const bgColor = index % 2 === 0 ? '#e6f3ff' : '#f0f8ff';
        drawCell(currentX, 0, cellWidth, cellHeight, event.label, bgColor, true);
        currentX += cellWidth;
      });

      // Row 2: Records
      currentX = 0;
      drawCell(currentX, cellHeight, pbCellWidth, cellHeight, 'Record', '#ffffff', true);
      currentX += pbCellWidth;

      events.forEach((event, index) => {
        const stat = getStatForEvent(event.key);
        const value = stat ? formatValue(stat, event) : '-';
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f8f8';
        drawCell(currentX, cellHeight, cellWidth, cellHeight, value, bgColor, true);
        currentX += cellWidth;
      });

      // Row 3: Dates
      currentX = 0;
      drawCell(currentX, cellHeight * 2, pbCellWidth, cellHeight, 'Date', '#ffffff', true);
      currentX += pbCellWidth;

      events.forEach((event, index) => {
        const stat = getStatForEvent(event.key);
        const date = stat?.all_time_record ? formatDate(stat.all_time_record.achieved_at) : '-';
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f8f8';
        drawCell(currentX, cellHeight * 2, cellWidth, cellHeight, date, bgColor, false);
        currentX += cellWidth;
      });

      // Row 4: Season Records - FIXED: Removed "SB" suffix
      currentX = 0;
      drawCell(currentX, cellHeight * 3, pbCellWidth, cellHeight, currentSeason, '#e6f3ff', true);
      currentX += pbCellWidth;

      events.forEach((event, index) => {
        const stat = getStatForEvent(event.key);
        const value = stat ? formatValue(stat, event, true) : '-';
        const bgColor = index % 2 === 0 ? '#e6f3ff' : '#f0f8ff';
        drawCell(currentX, cellHeight * 3, cellWidth, cellHeight, value, bgColor, false);
        currentX += cellWidth;
      });

      const imageUrl = canvas.toDataURL('image/png');
      setGeneratedImageUrl(imageUrl);
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!generatedImageUrl) return;

    const link = document.createElement('a');
    // Updated filename format: name_pbdash_export.png
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

  // Get events and sort by display order
  const events = SPORT_EVENTS[selectedSport].sort((a, b) => a.displayOrder - b.displayOrder);
  const currentSeason = getCurrentSeason();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Generate PB Image</h2>
              <p className="text-sm text-slate-600">Create a shareable image of your personal bests</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {generatedImageUrl && (
              <>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center space-x-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors duration-200"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="text-sm">Copy</span>
                </button>
                <button
                  onClick={downloadImage}
                  className="flex items-center space-x-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200"
                >
                  <Download className="w-4 h-4" />
                  <span className="text-sm">Download</span>
                </button>
              </>
            )}
            
            <button
              onClick={generateImage}
              disabled={isGenerating}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
              <span className="text-sm">{isGenerating ? 'Generating...' : 'Generate Image'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Preview Table */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Preview</h3>
          <div className="bg-white p-2 rounded border text-xs overflow-x-auto">
            <table className="w-full border-collapse">
              {/* Row 1: Event Headers */}
              <tr className="bg-blue-50">
                <td className="py-1 px-2 font-bold text-center border border-slate-400 w-16">PB</td>
                {events.map((event, index) => (
                  <td key={event.key} className={`py-1 px-2 font-bold text-center border border-slate-400 ${index % 2 === 0 ? 'bg-blue-50' : 'bg-blue-100'}`}>
                    {event.label}
                  </td>
                ))}
              </tr>

              {/* Row 2: Record Values */}
              <tr>
                <td className="py-1 px-2 font-bold text-center border border-slate-400">Record</td>
                {events.map((event, index) => {
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
                {events.map((event, index) => {
                  const stat = getStatForEvent(event.key);
                  return (
                    <td key={event.key} className={`py-1 px-2 text-center border border-slate-400 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      {stat?.all_time_record ? formatDate(stat.all_time_record.achieved_at) : '-'}
                    </td>
                  );
                })}
              </tr>

              {/* Row 4: Season Records - FIXED: Removed "SB" suffix */}
              <tr className="bg-blue-50">
                <td className="py-1 px-2 font-bold text-center border border-slate-400">{currentSeason}</td>
                {events.map((event, index) => {
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

        {/* Generated Image Preview */}
        {generatedImageUrl && (
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Generated Image</h3>
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <img 
                src={generatedImageUrl} 
                alt="Generated PB Image" 
                className="max-w-full h-auto rounded-lg shadow-sm"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};