import React, { useEffect, useRef } from 'react';

// AudioRecorder component that handles audio recording in the renderer process
const AudioRecorder = () => {
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const outputPath = useRef<string | null>(null);

  useEffect(() => {
    // Setup listeners for main process commands
    const beginRecordingListener = async (_event: any, data: { sources: any[], outputPath: string }) => {
      console.log('Begin recording request received from main process', data);
      outputPath.current = data.outputPath;
      
      try {
        // Get system audio
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create media recorder
        mediaRecorder.current = new MediaRecorder(stream);
        chunks.current = [];
        
        // Setup data handler
        mediaRecorder.current.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.current.push(e.data);
          }
        };
        
        // Setup stop handler
        mediaRecorder.current.onstop = async () => {
          console.log('MediaRecorder stopped');
          if (chunks.current.length > 0) {
            const blob = new Blob(chunks.current, { type: 'audio/webm' });
            chunks.current = [];
            
            // Convert blob to ArrayBuffer
            const arrayBuffer = await blob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // Save file using the Electron API
            try {
              if (outputPath.current) {
                // @ts-ignore - We know these methods exist but TypeScript doesn't
                await window.electronAPI.saveAudioFile({
                  path: outputPath.current,
                  buffer: buffer
                });
                console.log(`Audio saved to ${outputPath.current}`);
              }
            } catch (error) {
              console.error('Failed to save audio file:', error);
            }
          }
        };
        
        // Start recording
        mediaRecorder.current.start();
        console.log('MediaRecorder started');
      } catch (error) {
        console.error('Error starting MediaRecorder:', error);
      }
    };
    
    const stopRecordingListener = () => {
      console.log('Stop recording request received from main process');
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        mediaRecorder.current.stop();
        
        // Release microphone
        if (mediaRecorder.current.stream) {
          mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
        }
      }
    };
    
    // Register event listeners
    // @ts-ignore - We know these methods exist but TypeScript doesn't
    window.electronAPI.onBeginRecording(beginRecordingListener);
    // @ts-ignore - We know these methods exist but TypeScript doesn't
    window.electronAPI.onStopRecording(stopRecordingListener);
    
    // Cleanup
    return () => {
      // @ts-ignore - We know these methods exist but TypeScript doesn't
      window.electronAPI.removeBeginRecordingListener();
      // @ts-ignore - We know these methods exist but TypeScript doesn't
      window.electronAPI.removeStopRecordingListener();
      
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        mediaRecorder.current.stop();
        
        if (mediaRecorder.current.stream) {
          mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }, []);
  
  // This component doesn't render anything visible
  return null;
};

export default AudioRecorder;
