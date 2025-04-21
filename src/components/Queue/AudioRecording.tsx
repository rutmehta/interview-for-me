import React, { useState, useEffect } from 'react';
import { FaMicrophone, FaStop, FaSpinner } from 'react-icons/fa';

interface AudioRecordingProps {
  onRecordingComplete: () => void;
  onRecordingError: (error: string) => void;
}

const AudioRecording: React.FC<AudioRecordingProps> = ({
  onRecordingComplete,
  onRecordingError
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
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
  
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };
  
  const startRecording = async () => {
    try {
      const result = await window.electronAPI.startAudioRecording();
      
      if (result.success) {
        setIsRecording(true);
      } else {
        onRecordingError(result.error || 'Failed to start recording');
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      onRecordingError('Failed to start recording');
    }
  };
  
  const stopRecording = async () => {
    try {
      setIsRecording(false);
      setIsProcessing(true);
      
      const result = await window.electronAPI.stopAudioRecording();
      
      setIsProcessing(false);
      
      if (result.success) {
        onRecordingComplete();
      } else {
        onRecordingError(result.error || 'Failed to process recording');
      }
    } catch (error) {
      setIsProcessing(false);
      console.error('Error stopping recording:', error);
      onRecordingError('Failed to process recording');
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      {isRecording ? (
        <>
          <span className="text-[11px] leading-none text-red-400 flex items-center gap-1">
            <span className="animate-pulse">●</span> 
            {formatTime(recordingTime)}
          </span>
          <button 
            onClick={stopRecording}
            className="bg-red-500/70 hover:bg-red-500/90 transition-colors text-white px-2 py-1 rounded-md flex items-center gap-2 text-xs"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <FaSpinner className="animate-spin h-3 w-3" />
                Processing...
              </>
            ) : (
              <>
                <FaStop className="h-3 w-3" />
                Stop
              </>
            )}
          </button>
        </>
      ) : (
        <button 
          onClick={startRecording}
          className="bg-blue-500/70 hover:bg-blue-500/90 transition-colors text-white px-2 py-1 rounded-md flex items-center gap-2 text-xs"
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <FaSpinner className="animate-spin h-3 w-3" />
              Processing...
            </>
          ) : (
            <>
              <FaMicrophone className="h-3 w-3" />
              Record Question
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default AudioRecording;
