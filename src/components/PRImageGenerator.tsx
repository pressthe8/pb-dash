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
}

// Event configurations for each sport
const SPORT_EVENTS: Record<SportType, EventConfig[]> = {
  rower: [
    { key: '100m_row', label: '100m', isTimeEvent: false },
    { key: '500m_row', label: '500m', isTimeEvent: false },
    { key: '1k_row', label: '1K', isTimeEvent: false },
    { key: '2k_row', label: '2K', isTimeEvent: false },
    { key: '5k_row', label: '5K', isTimeEvent: false },
    { key: '6k_row', label: '6K', isTimeEvent: false },
    { key: '10k_row', label: '10K', isTimeEvent: false },
    { key: '30min_row', label: '30min', isTimeEvent: true },
    { key: '60min_row', label: '60min', isTimeEvent: true },
    { key: 'half_marathon_row', label: 'HM', isTimeEvent: false },
    { key: 'marathon_row', label: 'FM', isTimeEvent: false },
  ],
  bike: [
    { key: '100m_bike', label: '100m', isTimeEvent: false },
    { key: '500m_bike', label: '500m', isTimeEvent: false },
    { key: '1k_bike', label: '1K', isTimeEvent: false },
    { key: '2k_bike', label: '2K', isTimeEvent: false },
    { key: '5k_bike', label: '5K', isTimeEvent: false },
    { key: '10k_bike', label: '10K', isTimeEvent: false },
    { key: '30min_bike', label: '30min', isTimeEvent: true },
    { key: '60min_bike', label: '60min', isTimeEvent: true },
  ],
  skierg: [
    { key: '100m_ski', label: '100m', isTimeEvent: false },
    { key: '500m_ski', label: '500m', isTimeEvent: false },
    { key: '1k_ski', label: '1K', isTimeEvent: false },
    { key: '2k_ski', label: '2K', isTimeEvent: false },
    { key: '5k_ski', label: '5K', isTimeEvent: false },
    { key: '10k_ski', label: '10K', isTimeEvent: false },
    { key: '30min_ski', label: '30min', isTimeEvent: true },
    { key: '60min_ski', label: '60min', isTimeEvent: true },
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
  const tableRef = useRef<HTMLDivElement>(null);

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
    if (!tableRef.current) return;

    setIsGenerating(true);
    
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#ffffff',
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        width: 800,
        height: 200,
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

  const events = SPORT_EVENTS[selectedSport];
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
        <div 
          ref={tableRef}
          className="bg-white p-6 rounded-lg border-2 border-slate-200"
          style={{ width: '800px', height: '200px' }}
        >
          {/* Header with user name and sport */}
          <div className="text-center mb-4">
            <h3 className="text-lg font-bold text-slate-900">{userDisplayName} - {SPORT_MAPPING[selectedSport]} Personal Bests</h3>
          </div>

          {/* PB Table */}
          <table className="w-full text-xs">
            {/* Row 1: Event Headers */}
            <tr className="border-b border-slate-300">
              <td className="font-bold text-slate-700 py-1 px-1 text-left">PB</td>
              {events.map(event => (
                <td key={event.key} className="font-bold text-slate-700 py-1 px-1 text-center">
                  {event.label}
                </td>
              ))}
            </tr>

            {/* Row 2: PB Values */}
            <tr className="border-b border-slate-200">
              <td className="py-1 px-1"></td>
              {events.map(event => {
                const stat = getStatForEvent(event.key);
                return (
                  <td key={event.key} className="font-semibold text-slate-900 py-1 px-1 text-center">
                    {stat ? formatValue(stat, event) : '-'}
                  </td>
                );
              })}
            </tr>

            {/* Row 3: PB Dates */}
            <tr className="border-b border-slate-200">
              <td className="py-1 px-1"></td>
              {events.map(event => {
                const stat = getStatForEvent(event.key);
                return (
                  <td key={event.key} className="text-slate-600 py-1 px-1 text-center">
                    {stat?.all_time_record ? formatDate(stat.all_time_record.achieved_at) : '-'}
                  </td>
                );
              })}
            </tr>

            {/* Row 4: Season Records */}
            <tr>
              <td className="font-bold text-slate-700 py-1 px-1 text-left">{currentSeason} SB</td>
              {events.map(event => {
                const stat = getStatForEvent(event.key);
                return (
                  <td key={event.key} className="text-slate-800 py-1 px-1 text-center">
                    {stat ? formatValue(stat, event, true) : '-'}
                  </td>
                );
              })}
            </tr>
          </table>

          {/* Footer */}
          <div className="text-center mt-4">
            <p className="text-xs text-slate-500">Generated by PB Dash • {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Generated Image Preview */}
        {generatedImageUrl && (
          <div className="mt-6">
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