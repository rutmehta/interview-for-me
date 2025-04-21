import React, { useState, useEffect } from 'react';

interface RecordingIndicatorProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

const RecordingIndicator: React.FC<RecordingIndicatorProps> = ({ 
  position = 'bottom-right' 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  useEffect(() => {
    // Listen for recording status changes
    const removeStartListener = window.electronAPI.onAudioRecordingStarted(() => {
      setIsRecording(true);
      setRecordingTime(0);
    });
    
    const removeStopListener = window.electronAPI.onAudioRecordingStopped(() => {
      setIsRecording(false);
    });
    
    return () => {
      removeStartListener();
      removeStopListener();
    };
  }, []);
  
  // Timer for recording duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);
  
  // Don't render anything if not recording
  if (!isRecording) return null;
  
  // Position classes
  const positionClasses = {
    'top-left': 'top-1 left-1',
    'top-right': 'top-1 right-1',
    'bottom-left': 'bottom-1 left-1',
    'bottom-right': 'bottom-1 right-1',
  };
  
  return (
    <div 
      className={`fixed ${positionClasses[position]} w-2 h-2 rounded-full bg-red-500 opacity-50 z-50`}
      title={`Recording in progress (${Math.floor(recordingTime / 60)}:${(recordingTime % 60).toString().padStart(2, '0')})`}
    >
      {/* This is an almost invisible dot */}
    </div>
  );
};

export default RecordingIndicator;
