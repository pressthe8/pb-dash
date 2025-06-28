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

// Event configurations for each sport with proper display order
const SPORT_EVENTS: Record<SportType, EventConfig[]> = {
  rower: [
    { key: '100m_row', label: '100m', isTimeEvent: false, displayOrder: 1 },
    { key: '500m_row', label: '500m', isTimeEvent: false, displayOrder: 2 },
    { key: '1k_row', label: '1K', isTimeEvent: false, displayOrder: 3 },
    { key: '2k_row', label: '2K', isTimeEvent: false, displayOrder: 4 },
    { key: '5k_row', label: '5K', isTimeEvent: false, displayOrder: 5 },
    { key: '6k_row', label: '6K', isTimeEvent: false, displayOrder: 6 },
    { key: '10k_row', label: '10K', isTimeEvent: false, displayOrder: 7 },
    { key: '30min_row', label: '30min', isTimeEvent: true, displayOrder: 8 },
    { key: '60min_row', label: '60min', isTimeEvent: true, displayOrder: 9 },
    { key: 'half_marathon_row', label: 'HM', isTimeEvent: false, displayOrder: 10 },
    { key: 'marathon_row', label: 'FM', isTimeEvent: false, displayOrder: 11 },
  ],
  bike: [
    { key: '100m_bike', label: '100m', isTimeEvent: false, displayOrder: 1 },
    { key: '500m_bike', label: '500m', isTimeEvent: false, displayOrder: 2 },
    { key: '1k_bike', label: '1K', isTimeEvent: false, displayOrder: 3 },
    { key: '2k_bike', label: '2K', isTimeEvent: false, displayOrder: 4 },
    { key: '5k_bike', label: '5K', isTimeEvent: false, displayOrder: 5 },
    { key: '10k_bike', label: '10K', isTimeEvent: false, displayOrder: 6 },
    { key: '30min_bike', label: '30min', isTimeEvent: true, displayOrder: 7 },
    { key: '60min_bike', label: '60min', isTimeEvent: true, displayOrder: 8 },
  ],
  skierg: [
    { key: '100m_ski', label: '100m', isTimeEvent: false, displayOrder: 1 },
    { key: '500m_ski', label: '500m', isTimeEvent: false, displayOrder: 2 },
    { key: '1k_ski', label: '1K', isTimeEvent: false, displayOrder: 3 },
    { key: '2k_ski', label: '2K', isTimeEvent: false, displayOrder: 4 },
    { key: '5k_ski', label: '5K', isTimeEvent: false, displayOrder: 5 },
    { key: '10k_ski', label: '10K', isTimeEvent: false, displayOrder: 6 },
    { key: '30min_ski', label: '30min', isTimeEvent: true, displayOrder: 7 },
    { key: '60min_ski', label: '60min', isTimeEvent: true, displayOrder: 8 },
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

  // Format value based on event type
  const formatValue = (stat: PRStats, eventConfig: EventConfig, isSeasonRecord: boolean = false): string => {
    const record = isSeasonRecord ? stat.current_season_record : stat.all_time_record;
    if (!record) return '-';

    if (eventConfig.isTimeEvent) {
      // Time events show distance achieved
      return `${(record.metric_value / 1000).toFixed(1)}k`;
    } else {
      // Distance events show time taken
      return formatTime(record.metric_value);
    }
  };

  // Format date as MM/YY
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${month}/${year}`;
  };

  // Get stat for specific event
  const getStatForEvent = (eventKey: string): PRStats | null => {
    return prStats.find(stat => stat.activity_key === eventKey) || null;
  };

  const generateImage = async () => {
    setIsGenerating(true);
    
    try {
      // Create a temporary div for rendering
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      tempDiv.style.width = '800px';
      tempDiv.style.height = '200px';
      tempDiv.style.backgroundColor = '#ffffff';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      tempDiv.style.padding = '20px';
      tempDiv.style.boxSizing = 'border-box';

      // Get events and sort by display order
      const events = SPORT_EVENTS[selectedSport].sort((a, b) => a.displayOrder - b.displayOrder);
      const currentSeason = getCurrentSeason();

      // Create table HTML
      tempDiv.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <!-- Row 1: Event Headers -->
          <tr style="border-bottom: 1px solid #000;">
            <td style="padding: 4px 6px; font-weight: bold; text-align: left; width: 60px;">PB</td>
            ${events.map(event => `
              <td style="padding: 4px 6px; font-weight: bold; text-align: center; width: ${(740 / events.length)}px;">
                ${event.label}
              </td>
            `).join('')}
          </tr>
          
          <!-- Row 2: Record Values -->
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 4px 6px; font-weight: bold; text-align: left;">Record</td>
            ${events.map(event => {
              const stat = getStatForEvent(event.key);
              const value = stat ? formatValue(stat, event) : '-';
              return `
                <td style="padding: 4px 6px; font-weight: bold; text-align: center;">
                  ${value}
                </td>
              `;
            }).join('')}
          </tr>
          
          <!-- Row 3: Dates -->
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 4px 6px; font-weight: bold; text-align: left;">Date</td>
            ${events.map(event => {
              const stat = getStatForEvent(event.key);
              const date = stat?.all_time_record ? formatDate(stat.all_time_record.achieved_at) : '-';
              return `
                <td style="padding: 4px 6px; text-align: center; color: #666;">
                  ${date}
                </td>
              `;
            }).join('')}
          </tr>
          
          <!-- Row 4: Season Records -->
          <tr>
            <td style="padding: 4px 6px; font-weight: bold; text-align: left;">${currentSeason} SB</td>
            ${events.map(event => {
              const stat = getStatForEvent(event.key);
              const value = stat ? formatValue(stat, event, true) : '-';
              return `
                <td style="padding: 4px 6px; text-align: center;">
                  ${value}
                </td>
              `;
            }).join('')}
          </tr>
        </table>
      `;

      document.body.appendChild(tempDiv);

      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(tempDiv, {
        backgroundColor: '#ffffff',
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        width: 800,
        height: 200,
      });

      // Clean up
      document.body.removeChild(tempDiv);

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
    link.download = `${userDisplayName.replace(/\s+/g, '_')}_${SPORT_MAPPING[selectedSport]}_PBs.png`;
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
          <div className="bg-white p-4 rounded border text-xs">
            <table className="w-full border-collapse">
              {/* Row 1: Event Headers */}
              <tr className="border-b border-slate-900">
                <td className="py-1 px-2 font-bold text-left w-16">PB</td>
                {events.map(event => (
                  <td key={event.key} className="py-1 px-2 font-bold text-center">
                    {event.label}
                  </td>
                ))}
              </tr>

              {/* Row 2: Record Values */}
              <tr className="border-b border-slate-300">
                <td className="py-1 px-2 font-bold text-left">Record</td>
                {events.map(event => {
                  const stat = getStatForEvent(event.key);
                  return (
                    <td key={event.key} className="py-1 px-2 font-bold text-center">
                      {stat ? formatValue(stat, event) : '-'}
                    </td>
                  );
                })}
              </tr>

              {/* Row 3: Dates */}
              <tr className="border-b border-slate-300">
                <td className="py-1 px-2 font-bold text-left">Date</td>
                {events.map(event => {
                  const stat = getStatForEvent(event.key);
                  return (
                    <td key={event.key} className="py-1 px-2 text-center text-slate-600">
                      {stat?.all_time_record ? formatDate(stat.all_time_record.achieved_at) : '-'}
                    </td>
                  );
                })}
              </tr>

              {/* Row 4: Season Records */}
              <tr>
                <td className="py-1 px-2 font-bold text-left">{currentSeason} SB</td>
                {events.map(event => {
                  const stat = getStatForEvent(event.key);
                  return (
                    <td key={event.key} className="py-1 px-2 text-center">
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