'use client';

import React, { useState, useRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { 
  Mic, Loader2, Waves, Radio, 
  Settings, X, CheckCircle, AlertCircle 
} from 'lucide-react';

export interface EnhancedVoiceInputHandle {
  start: () => Promise<void>;
  stop: () => void;
  isRecording: () => boolean;
  releaseStream: () => void;
}

interface EnhancedVoiceInputProps {
  onTranscription: (text: string) => void;
  onInterimTranscription?: (text: string) => void;
  language?: string;
  className?: string;
  enableStreaming?: boolean;
  showSettings?: boolean;
  autoSend?: boolean;
  autoStopOnSilence?: boolean;
  keepStreamAlive?: boolean;
}

interface VoiceSettings {
  language: string;
  enableVAD: boolean;
  silenceTimeout: number;
  enableInterim: boolean;
}

export const EnhancedVoiceInput = React.forwardRef<EnhancedVoiceInputHandle, EnhancedVoiceInputProps>(({
  onTranscription,
  onInterimTranscription,
  language = 'hi-IN',
  className = '',
  enableStreaming = true,
  showSettings = false,
  autoStopOnSilence = false,
  keepStreamAlive = false,
}, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const [settings, setSettings] = useState<VoiceSettings>({
    language: language,
    enableVAD: true,
    silenceTimeout: 1000, // Reduced from 1500ms for faster response
    enableInterim: true,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const noiseFloorRef = useRef<number | null>(null);

  const stopRecording = useCallback(() => {
    console.log('🎤 Stopping recording...');
    setIsRecording(false);
    setInterimText('');
    recordingStartedAtRef.current = null;
    noiseFloorRef.current = null;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (websocketRef.current) {
      // Avoid InvalidStateError when the socket is still CONNECTING/CLOSING
      if (websocketRef.current.readyState === WebSocket.OPEN) {
        websocketRef.current.send(JSON.stringify({ type: 'end' }));
      }
      websocketRef.current.close();
      websocketRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('🎤 Stopping MediaRecorder...');
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // When keepStreamAlive is true, preserve the raw MediaStream so
    // subsequent start() calls can reuse it without needing getUserMedia()
    // (which would require a fresh user gesture and get blocked by browsers).
    if (!keepStreamAlive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [keepStreamAlive]);

  // Fully release the MediaStream — call when voice call mode ends
  const releaseStream = useCallback(() => {
    console.log('🎤 Releasing stream...');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Cleanup on unmount — always fully release stream to prevent mic leaks
  useEffect(() => {
    return () => {
      stopRecording();
      releaseStream();
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopRecording, releaseStream]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Audio level visualization (also powers optional silence auto-stop)
  const startAudioVisualization = useCallback((stream: MediaStream) => {
    audioContextRef.current = new AudioContext();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    analyzerRef.current = audioContextRef.current.createAnalyser();
    analyzerRef.current.fftSize = 256;
    source.connect(analyzerRef.current);

    const frequencyData = new Uint8Array(analyzerRef.current.frequencyBinCount);
    const timeData = new Uint8Array(analyzerRef.current.fftSize);

    const updateLevel = () => {
      if (analyzerRef.current && isRecordingRef.current) {
        // Read data to keep analyzers warm (frequency is used for visual feedback elsewhere).
        analyzerRef.current.getByteFrequencyData(frequencyData);

        // Optional silence auto-stop for hands-free voice call.
        // Use time-domain RMS for a more stable silence signal.
        if (autoStopOnSilence) {
          analyzerRef.current.getByteTimeDomainData(timeData);
          let sumSquares = 0;
          for (let i = 0; i < timeData.length; i++) {
            const sample = (timeData[i] - 128) / 128;
            sumSquares += sample * sample;
          }
          const rms = Math.sqrt(sumSquares / timeData.length);

          // Adaptive noise floor so we don't get stuck "never silent" in noisy rooms.
          // Update quickly downward, slowly upward.
          if (noiseFloorRef.current === null) {
            noiseFloorRef.current = rms;
          } else {
            const floor = noiseFloorRef.current;
            noiseFloorRef.current = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.995 + rms * 0.005;
          }

          const noiseFloor = noiseFloorRef.current ?? 0;
          // More aggressive silence threshold - easier to trigger silence detection
          const silenceThreshold = Math.max(0.02, noiseFloor * 2.5 + 0.01);
          const isSilent = rms < silenceThreshold;

          // Debug logging for silence detection (every ~60 frames = 1 second)
          if (Math.random() < 0.017) {
            console.log(`🔇 Silence check: RMS=${rms.toFixed(4)}, floor=${noiseFloor.toFixed(4)}, threshold=${silenceThreshold.toFixed(4)}, silent=${isSilent}`);
          }

          // Hard cap: if we can't find silence (music/noise), stop and send anyway.
          const startedAt = recordingStartedAtRef.current;
          if (startedAt && Date.now() - startedAt > 12000) {
            console.log('🎤 Hard cap reached (12s), stopping recording...');
            if (isRecordingRef.current) stopRecording();
            return;
          }

          if (isSilent) {
            if (!silenceTimerRef.current) {
              console.log(`🔇 Silence detected, starting ${settings.silenceTimeout}ms timer...`);
              silenceTimerRef.current = setTimeout(() => {
                console.log('🔇 Silence timeout reached, stopping recording...');
                silenceTimerRef.current = null;
                // Stop only if we're still recording.
                if (isRecordingRef.current) {
                  stopRecording();
                }
              }, settings.silenceTimeout);
            }
          } else if (silenceTimerRef.current) {
            console.log('🔇 Speech resumed, cancelling silence timer');
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      }
    };

    updateLevel();
  }, [autoStopOnSilence, settings.silenceTimeout, stopRecording]);

  // WebSocket streaming for real-time transcription
  const startStreamingASR = useCallback(async (stream: MediaStream) => {
    // Mercury ASR WebSocket endpoint
    // In production, use wss:// via the domain; locally fall back to LAN IP
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const defaultWsUrl = hostname === 'chat.mangwale.ai' || hostname === 'admin.mangwale.ai'
      ? 'wss://api.mangwale.ai/ws/voice'
      : 'ws://localhost:7001/stream';
    const wsUrl = process.env.NEXT_PUBLIC_VOICE_STREAMING_URL || defaultWsUrl;
    
    setConnectionStatus('connecting');
    websocketRef.current = new WebSocket(wsUrl);

    websocketRef.current.onopen = () => {
      setConnectionStatus('connected');
      setIsStreaming(true);
      
      // Send config
      websocketRef.current?.send(JSON.stringify({
        type: 'config',
        language: settings.language,
        enableVAD: settings.enableVAD,
        enableInterim: settings.enableInterim,
      }));
    };

    websocketRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'interim' && settings.enableInterim) {
          setInterimText(data.text);
          onInterimTranscription?.(data.text);
        } else if (data.type === 'final') {
          setInterimText('');
          onTranscription(data.text);
          
          // Auto-stop after final result if VAD detected silence
          if (data.endOfSpeech) {
            stopRecording();
          }
        } else if (data.type === 'error') {
          setError(data.message);
          stopRecording();
        }
      } catch (e) {
        console.error('Error parsing ASR response:', e);
      }
    };

    websocketRef.current.onerror = () => {
      console.warn('WebSocket streaming not available, using upload mode');
      setIsStreaming(false);
      setConnectionStatus('disconnected');
      // Don't show error - silently fall back to upload mode
    };

    websocketRef.current.onclose = () => {
      setConnectionStatus('disconnected');
      setIsStreaming(false);
    };

    // Start audio processor for streaming
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (websocketRef.current?.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        websocketRef.current.send(pcmData.buffer);
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  }, [settings, onTranscription, onInterimTranscription, stopRecording]);

  // Traditional upload-based transcription
  const uploadForTranscription = useCallback(async () => {
    setIsProcessing(true);
    setError(null);
    console.log('🎤 Starting transcription upload, chunks:', chunksRef.current.length);

    try {
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      console.log('🎤 Audio blob size:', audioBlob.size, 'bytes');
      
      if (audioBlob.size < 1000) {
        console.warn('🎤 Audio too short, skipping');
        setError('Recording too short - please speak longer');
        return;
      }
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', settings.language);

      console.log('🎤 Uploading to /api/asr/transcribe/upload...');
      const response = await fetch('/api/asr/transcribe/upload', {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('🎤 Transcription result:', result);

      // Backend returns { text, language, confidence, provider, processingTimeMs }
      // with no explicit `success` flag. Treat presence of text as success.
      const isSuccess = result.success === undefined ? !!result.text : result.success;

      if (isSuccess && result.text) {
        console.log('✅ Transcribed text:', result.text);
        onTranscription(result.text);
      } else {
        console.error('❌ Transcription failed:', result);
        if (isSuccess && !result.text) {
          setError('No speech detected - please try speaking clearer');
        } else {
          setError(result.error || 'Transcription service unavailable');
        }
      }
    } catch (error) {
      console.error('❌ Error uploading audio:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to process audio';
      setError(errorMsg.includes('timeout') ? 'Request timeout - please try again' : errorMsg);
    } finally {
      setIsProcessing(false);
      chunksRef.current = [];
    }
  }, [settings.language, onTranscription]);

  const startRecording = useCallback(async () => {
    setError(null);
    console.log('🎤 Starting recording...');

    try {
      // Reuse existing stream if keepStreamAlive left one active
      let stream: MediaStream;
      const existingStream = streamRef.current;
      const hasActiveTrack = existingStream?.getAudioTracks().some(t => t.readyState === 'live');

      if (existingStream && hasActiveTrack) {
        console.log('🎤 Reusing existing MediaStream (keepStreamAlive)');
        stream = existingStream;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          }
        });
        console.log('🎤 Microphone access granted');
        streamRef.current = stream;
      }

      recordingStartedAtRef.current = Date.now();
      startAudioVisualization(stream);

      // Try streaming first if enabled
      if (enableStreaming) {
        try {
          console.log('🎤 Trying streaming ASR...');
          await startStreamingASR(stream);
          setIsRecording(true);
          return;
        } catch {
          console.warn('Streaming not available, using upload mode');
        }
      }

      // Fall back to MediaRecorder
      console.log('🎤 Using MediaRecorder upload mode');
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log('🎤 Audio chunk received:', event.data.size, 'bytes, total chunks:', chunksRef.current.length);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('🎤 Recording stopped, uploading...');
        await uploadForTranscription();
        // Only release stream tracks if we're not keeping it alive for voice call loop
        if (!keepStreamAlive) {
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      mediaRecorder.start(1000); // Capture in 1s chunks
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

      // Note: VAD auto-stop is disabled for now - user must click to stop
      // This is more reliable than automatic silence detection
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError('Microphone access denied');
      // Release stream on error to avoid mic leak
      if (streamRef.current && !keepStreamAlive) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, [enableStreaming, keepStreamAlive, startAudioVisualization, startStreamingASR, uploadForTranscription]);

  useImperativeHandle(ref, () => ({
    start: async () => {
      if (isRecordingRef.current || isProcessing) return;
      await startRecording();
    },
    stop: () => {
      if (!isRecordingRef.current) return;
      stopRecording();
    },
    isRecording: () => isRecordingRef.current,
    releaseStream,
  }), [isProcessing, startRecording, stopRecording, releaseStream]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return (
    <div className="relative inline-flex items-center">
      {/* Main button */}
      <button
        onClick={toggleRecording}
        disabled={isProcessing}
        className={`relative p-2 rounded-full transition-all duration-200 ${className} ${
          isRecording 
            ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-500/50' 
            : isProcessing
            ? 'bg-orange-500 text-white'
            : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'
        } ${isProcessing ? 'cursor-wait' : ''}`}
        title={isProcessing ? 'Processing...' : isRecording ? 'Tap to stop' : 'Tap to speak'}
        type="button"
      >
        {isProcessing ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isRecording ? (
          <>
            <Mic className="w-5 h-5 animate-pulse" />
            {/* Pulsing rings */}
            <span className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping opacity-50" />
            <span className="absolute -inset-1 rounded-full border border-red-300 animate-pulse opacity-30" />
          </>
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </button>

      {/* Recording status text */}
      {(isRecording || isProcessing) && (
        <span className={`ml-2 text-xs font-medium ${isRecording ? 'text-red-500' : 'text-orange-500'}`}>
          {isProcessing ? '🔄 Sending...' : autoStopOnSilence ? '🎤 Listening...' : '🎤 Recording - tap to send'}
        </span>
      )}

      {/* Streaming indicator */}
      {isStreaming && (
        <span className="ml-1 flex items-center gap-1 text-xs text-green-500">
          <Radio className="w-3 h-3 animate-pulse" />
          Live
        </span>
      )}

      {/* Settings button */}
      {showSettings && (
        <button
          onClick={() => setShowSettingsModal(true)}
          className="ml-1 p-1 text-gray-400 hover:text-gray-600"
          type="button"
        >
          <Settings className="w-4 h-4" />
        </button>
      )}

      {/* Interim text display */}
      {interimText && (
        <div className="absolute bottom-full left-0 mb-2 px-3 py-1 bg-gray-800 text-white text-sm rounded shadow-lg whitespace-nowrap">
          <Waves className="w-3 h-3 inline mr-1 animate-pulse" />
          {interimText}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="absolute bottom-full left-0 mb-2 px-3 py-1 bg-red-500 text-white text-sm rounded shadow-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-2">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSettingsModal(false)}>
          <div 
            className="bg-white dark:bg-gray-800 rounded-xl p-6 w-80 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold dark:text-white">Voice Settings</h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Language</label>
                <select
                  value={settings.language}
                  onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                >
                  <option value="hi-IN">Hindi (हिंदी)</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-IN">English (India)</option>
                  <option value="auto">Auto-detect</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Voice Activity Detection</span>
                <button
                  onClick={() => setSettings({ ...settings, enableVAD: !settings.enableVAD })}
                  className={`w-10 h-5 rounded-full transition ${
                    settings.enableVAD ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`block w-4 h-4 bg-white rounded-full transform transition ${
                    settings.enableVAD ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Show Interim Results</span>
                <button
                  onClick={() => setSettings({ ...settings, enableInterim: !settings.enableInterim })}
                  className={`w-10 h-5 rounded-full transition ${
                    settings.enableInterim ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`block w-4 h-4 bg-white rounded-full transform transition ${
                    settings.enableInterim ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  Silence Timeout: {settings.silenceTimeout}ms
                </label>
                <input
                  type="range"
                  min="500"
                  max="3000"
                  step="100"
                  value={settings.silenceTimeout}
                  onChange={(e) => setSettings({ ...settings, silenceTimeout: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                Connection: {connectionStatus}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

EnhancedVoiceInput.displayName = 'EnhancedVoiceInput';

export default EnhancedVoiceInput;
