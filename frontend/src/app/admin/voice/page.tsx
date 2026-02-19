'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, Volume2, Settings, RefreshCw, CheckCircle, XCircle, AlertCircle,
  Play, Square, Upload, Download, Globe, Zap, Activity,
  Languages, Clock, Gauge, Server, Sliders, TestTube, FileAudio,
  Brain, Waves, Radio, Speaker, Cpu, HardDrive, Phone,
  Smile, MessageSquare, Sparkles
} from 'lucide-react';
import { adminBackendClient } from '@/lib/api/admin-backend';

// Mercury Service Status Types
interface MercuryStatus {
  connected: boolean;
  services: {
    asr: {
      healthy: boolean;
      latency: number;
      provider: string;
      model: string;
      gpu: string;
    };
    tts: {
      healthy: boolean;
      latency: number;
      provider: string;
      voices: string[];
      cachedPhrases: number;
    };
    orchestrator: {
      healthy: boolean;
      latency: number;
      activeSessions: number;
      features: string[];
    };
    nerve: {
      healthy: boolean;
      latency: number;
      activeCalls: number;
      providers: string[];
      ttsCached: number;
    };
  };
  gpu: {
    name: string;
    memoryUsed: string;
    memoryTotal: string;
    utilization: string;
  };
  gpus: Array<{
    host: string;
    name: string;
    memoryTotal: string;
    memoryUsed: string;
    memoryFree: string;
    utilization: string;
    temperature: string;
    services: string[];
  }>;
}

interface VoicesData {
  kokoro: {
    voices: string[];
    languages: string[];
    description: string;
  };
  chatterbox: {
    voices: string[];
    languages: string[];
    emotions: string[];
    styles: string[];
    description: string;
  };
}

export default function VoiceSettingsPage() {
  // Mercury status
  const [mercuryStatus, setMercuryStatus] = useState<MercuryStatus | null>(null);
  const [voices, setVoices] = useState<VoicesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'tts' | 'asr' | 'test'>('status');
  
  // TTS Configuration
  const [ttsProvider, setTtsProvider] = useState<'kokoro' | 'chatterbox'>('chatterbox');
  const [selectedVoice, setSelectedVoice] = useState('chotu');
  const [selectedLanguage, setSelectedLanguage] = useState('hi');
  const [selectedEmotion, setSelectedEmotion] = useState('helpful');
  const [selectedStyle, setSelectedStyle] = useState('conversational');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsExaggeration, setTtsExaggeration] = useState(0.3);
  const [ttsCfgWeight, setTtsCfgWeight] = useState(0.4);
  const [ttsPitch, setTtsPitch] = useState(1.0);
  
  // ASR Configuration
  const [asrProvider, setAsrProvider] = useState<'whisper' | 'cloud' | 'hybrid'>('whisper');
  const [asrLanguage, setAsrLanguage] = useState('auto');
  
  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  // TTS test state
  const [ttsText, setTtsText] = useState('नमस्ते, मैं मंगवाले AI हूँ। आपकी क्या सेवा करूँ?');
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastTtsLatency, setLastTtsLatency] = useState<number>(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch Mercury status
  const fetchMercuryStatus = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await adminBackendClient.getMercuryStatus() as Record<string, any>;
      console.log('Mercury API response:', data);

      // Transform API response to match component interface
      if (data.success && data.mercury) {
        const transformed = {
          connected: data.mercury.asr.status === 'healthy' && data.mercury.tts.status === 'healthy',
          services: {
            asr: {
              healthy: data.mercury.asr.status === 'healthy',
              latency: data.mercury.asr.latency || 0,
              provider: 'Whisper',
              model: 'faster-whisper-large-v3',
              gpu: data.mercury.asr.gpu?.name || 'Unknown',
            },
            tts: {
              healthy: data.mercury.tts.status === 'healthy',
              latency: data.mercury.tts.latency || 0,
              provider: 'Chatterbox + Kokoro',
              voices: data.mercury.tts.voices?.chatterbox?.voices || [],
              cachedPhrases: 0,
            },
            orchestrator: {
              healthy: data.mercury.orchestrator.status === 'healthy',
              latency: data.mercury.orchestrator.latency || 0,
              activeSessions: 0,
              features: ['VAD', 'Turn Manager', 'Session Manager', 'LLM'],
            },
            nerve: {
              healthy: data.mercury.nerve.status === 'healthy',
              latency: data.mercury.nerve.latency || 0,
              activeCalls: data.mercury.nerve.activeCalls || 0,
              providers: ['Twilio', 'Plivo'],
              ttsCached: data.mercury.nerve.ttsCacheSize || 0,
            },
          },
          gpu: {
            name: data.mercury.asr.gpu || data.mercury.tts.gpu || 'RTX 3060 12GB',
            memoryUsed: data.gpus?.[1]?.memoryUsed || 'N/A',
            memoryTotal: data.gpus?.[1]?.memoryTotal || '12GB',
            utilization: data.gpus?.[1]?.utilization || 'N/A',
          },
          gpus: data.gpus || [],
        };
        console.log('Transformed status:', transformed);
        setMercuryStatus(transformed);
      } else {
        console.error('Invalid Mercury status response:', data);
      }
    } catch (error) {
      console.error('Failed to fetch Mercury status:', error);
    }
  }, []);

  // Fetch available voices
  const fetchVoices = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await adminBackendClient.getMercuryVoices() as Record<string, any>;
      if (data.kokoro || data.chatterbox) {
        setVoices({
          kokoro: data.kokoro || { voices: [], languages: [], description: '' },
          chatterbox: data.chatterbox || { voices: [], languages: [], emotions: [], styles: [], description: '' },
        });
      }
    } catch (error) {
      console.error('Failed to fetch voices:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchMercuryStatus(), fetchVoices()]);
      setLoading(false);
    };
    loadData();
    
    // Load saved settings from localStorage
    const savedSettings = localStorage.getItem('tts_settings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        if (settings.provider) setTtsProvider(settings.provider);
        if (settings.voice) setSelectedVoice(settings.voice);
        if (settings.language) setSelectedLanguage(settings.language);
        if (settings.emotion) setSelectedEmotion(settings.emotion);
        if (settings.style) setSelectedStyle(settings.style);
        if (settings.speed !== undefined) setTtsSpeed(settings.speed);
        if (settings.exaggeration !== undefined) setTtsExaggeration(settings.exaggeration);
        if (settings.cfg_weight !== undefined) setTtsCfgWeight(settings.cfg_weight);
        if (settings.pitch !== undefined) setTtsPitch(settings.pitch);
      } catch (e) {
        console.error('Failed to load saved TTS settings:', e);
      }
    }
    
    // Auto-refresh status every 10 seconds
    const interval = setInterval(fetchMercuryStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchMercuryStatus, fetchVoices]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchMercuryStatus(), fetchVoices()]);
    setTimeout(() => setRefreshing(false), 500);
  };

  // Recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Microphone access denied or not available');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async () => {
    if (!audioBlob) return;

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', asrLanguage);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await adminBackendClient.transcribeAudio(formData) as Record<string, any>;
      setTranscription(data.text || data.transcription || '');
    } catch (error) {
      console.error('Transcription error:', error);
      setTranscription('Error: Failed to transcribe audio');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Download audio file
  const downloadAudio = () => {
    if (!ttsAudioUrl) return;
    
    try {
      // Handle both base64 and URL
      if (ttsAudioUrl.startsWith('data:')) {
        // Base64 audio - convert to blob for download
        const base64Data = ttsAudioUrl.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `tts-${selectedVoice}-${selectedLanguage}-${Date.now()}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        // Regular URL
        const link = document.createElement('a');
        link.href = ttsAudioUrl;
        link.download = `tts-${selectedVoice}-${selectedLanguage}-${Date.now()}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download audio');
    }
  };

  // Generate speech using Mercury TTS
  const generateSpeech = async () => {
    if (!ttsText.trim()) return;

    setIsGenerating(true);
    try {
      const startTime = Date.now();
      const data = await adminBackendClient.generateTts({
        text: ttsText,
        voice: selectedVoice,
        language: selectedLanguage,
        emotion: selectedEmotion,
        style: selectedStyle,
        speed: ttsSpeed,
        provider: ttsProvider,
        // Chatterbox advanced parameters (improves speed from 13s to 6s!)
        exaggeration: ttsProvider === 'chatterbox' ? ttsExaggeration : undefined,
        cfg_weight: ttsProvider === 'chatterbox' ? ttsCfgWeight : undefined,
        pitch: ttsProvider === 'chatterbox' ? ttsPitch : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as Record<string, any>;

      const latency = Date.now() - startTime;

      if (data.success && (data.audioUrl || data.audio)) {
        // Handle both audioUrl and base64 audio
        const audioUrl = data.audioUrl || `data:audio/wav;base64,${data.audio}`;
        setTtsAudioUrl(audioUrl);
        setLastTtsLatency(data.latency || latency);

        // Auto-play
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.play().catch(err => console.log('Autoplay prevented:', err));
        }
      } else {
        throw new Error(data.error || 'TTS generation failed - no audio returned');
      }
    } catch (error) {
      console.error('TTS error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to generate speech: ${errorMsg}\n\nMake sure Mercury TTS service is running at localhost:7002`);
    } finally {
      setIsGenerating(false);
    }
  };

  const getStatusBadge = (healthy: boolean | undefined) => {
    if (healthy === undefined) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-medium bg-gray-100 text-gray-500 border-gray-300">
          <AlertCircle size={16} />
          Unknown
        </span>
      );
    }
    return healthy ? (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-medium bg-green-100 text-green-700 border-green-300">
        <CheckCircle size={16} />
        Healthy
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-medium bg-red-100 text-red-700 border-red-300">
        <XCircle size={16} />
        Offline
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="animate-spin text-[#059211]" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Radio size={32} />
              <h1 className="text-3xl font-bold">Mercury Voice Services</h1>
            </div>
            <p className="text-purple-100">
              ASR (Whisper) • TTS (Chatterbox + Kokoro) • Voice Orchestrator • Nerve AI Calls
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 bg-white text-purple-600 px-6 py-3 rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Mercury Connection Status */}
      <div className={`rounded-xl p-4 ${mercuryStatus?.connected ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${mercuryStatus?.connected ? 'bg-green-200' : 'bg-red-200'}`}>
            <Server size={20} className={mercuryStatus?.connected ? 'text-green-700' : 'text-red-700'} />
          </div>
          <div>
            <h3 className={`font-bold ${mercuryStatus?.connected ? 'text-green-800' : 'text-red-800'}`}>
              Mercury Stack {mercuryStatus?.connected ? 'Connected' : 'Disconnected'}
            </h3>
            <p className={`text-sm ${mercuryStatus?.connected ? 'text-green-600' : 'text-red-600'}`}>
              192.168.0.151 • {mercuryStatus?.gpus?.length || 0} GPUs active
            </p>
          </div>
        </div>
      </div>

      {/* GPU Cards */}
      {mercuryStatus?.gpus && mercuryStatus.gpus.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mercuryStatus.gpus.map((gpu, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Cpu size={20} className="text-yellow-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{gpu.name}</h4>
                    <p className="text-xs text-gray-500">{gpu.host}</p>
                  </div>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Active</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-500">Used</div>
                  <div className="font-bold text-sm text-gray-900">{gpu.memoryUsed}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-500">Total</div>
                  <div className="font-bold text-sm text-gray-900">{gpu.memoryTotal}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-500">Temp</div>
                  <div className="font-bold text-sm text-gray-900">{gpu.temperature}</div>
                </div>
              </div>
              {/* Memory usage bar */}
              <div className="mb-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      parseInt(gpu.memoryUsed) / parseInt(gpu.memoryTotal) > 0.9 ? 'bg-red-500' :
                      parseInt(gpu.memoryUsed) / parseInt(gpu.memoryTotal) > 0.7 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${(parseInt(gpu.memoryUsed) / parseInt(gpu.memoryTotal) * 100).toFixed(0)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{gpu.memoryFree} free</span>
                  <span>GPU: {gpu.utilization}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {gpu.services.map(s => (
                  <span key={s} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {[
          { id: 'status', label: 'Service Status', icon: Activity },
          { id: 'tts', label: 'TTS Settings', icon: Volume2 },
          { id: 'asr', label: 'ASR Settings', icon: Mic },
          { id: 'test', label: 'Live Testing', icon: TestTube },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === tab.id 
                ? 'bg-purple-600 text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Status Tab */}
      {activeTab === 'status' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ASR Status Card */}
          <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Mic size={24} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">ASR Service</h3>
                  <p className="text-sm text-gray-500">Speech-to-Text</p>
                </div>
              </div>
              {getStatusBadge(mercuryStatus?.services.asr.healthy)}
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Provider</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.asr.provider || 'Whisper'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Latency</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.asr.latency || 0}ms</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Model</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.asr.model || 'large-v3'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">GPU</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.asr.gpu || 'RTX 3060'}</div>
              </div>
            </div>
          </div>

          {/* TTS Status Card */}
          <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Volume2 size={24} className="text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">TTS Service</h3>
                  <p className="text-sm text-gray-500">Text-to-Speech</p>
                </div>
              </div>
              {getStatusBadge(mercuryStatus?.services.tts.healthy)}
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Provider</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.tts.provider || 'Chatterbox + Kokoro'}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Latency</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.tts.latency || 0}ms</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Cached Phrases</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.tts.cachedPhrases || 0}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Voices</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.tts.voices?.length || 0} available</div>
              </div>
            </div>
          </div>

          {/* Orchestrator Status Card */}
          <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Brain size={24} className="text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Voice Orchestrator</h3>
                  <p className="text-sm text-gray-500">VAD + Turn Manager</p>
                </div>
              </div>
              {getStatusBadge(mercuryStatus?.services.orchestrator.healthy)}
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Active Sessions</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.orchestrator.activeSessions || 0}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Latency</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.orchestrator.latency || 0}ms</div>
              </div>
              <div className="col-span-2 bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Features</div>
                <div className="flex flex-wrap gap-1">
                  {(mercuryStatus?.services.orchestrator.features || ['VAD', 'Turn Manager', 'Session Manager', 'LLM']).map(f => (
                    <span key={f} className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Nerve Status Card */}
          <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Phone size={24} className="text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Nerve AI</h3>
                  <p className="text-sm text-gray-500">Voice Call Automation</p>
                </div>
              </div>
              {getStatusBadge(mercuryStatus?.services.nerve.healthy)}
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Active Calls</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.nerve.activeCalls || 0}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">TTS Cached</div>
                <div className="font-medium text-gray-900">{mercuryStatus?.services.nerve.ttsCached || 0}</div>
              </div>
              <div className="col-span-2 bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Providers</div>
                <div className="flex flex-wrap gap-1">
                  {(mercuryStatus?.services.nerve.providers || ['Twilio', 'Plivo']).map(p => (
                    <span key={p} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{p}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TTS Settings Tab */}
      {activeTab === 'tts' && (
        <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Volume2 size={24} className="text-purple-600" />
            Text-to-Speech Configuration
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* TTS Provider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">TTS Engine</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTtsProvider('chatterbox')}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    ttsProvider === 'chatterbox' 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-bold text-gray-900">Chatterbox</div>
                  <div className="text-sm text-gray-500">30+ languages, emotions, styles</div>
                </button>
                <button
                  onClick={() => setTtsProvider('kokoro')}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    ttsProvider === 'kokoro' 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-bold text-gray-900">Kokoro</div>
                  <div className="text-sm text-gray-500">High-quality English voices</div>
                </button>
              </div>
            </div>

            {/* Voice Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Voice</label>
              <select 
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {ttsProvider === 'chatterbox' ? (
                  (voices?.chatterbox.voices || ['chotu', 'meera', 'raj', 'priya', 'amit']).map(v => (
                    <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                  ))
                ) : (
                  (voices?.kokoro.voices || ['af_sky', 'af_sarah', 'af_bella', 'am_adam', 'am_michael']).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))
                )}
              </select>
            </div>

            {/* Language Selection (Chatterbox only) */}
            {ttsProvider === 'chatterbox' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Globe size={16} className="inline mr-1" />
                  Language
                </label>
                <select 
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {(voices?.chatterbox.languages || ['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa']).map(lang => (
                    <option key={lang} value={lang}>
                      {lang === 'hi' ? '🇮🇳 Hindi' : 
                       lang === 'en' ? '🇬🇧 English' : 
                       lang === 'ta' ? '🇮🇳 Tamil' :
                       lang === 'te' ? '🇮🇳 Telugu' :
                       lang === 'bn' ? '🇮🇳 Bengali' :
                       lang === 'mr' ? '🇮🇳 Marathi' :
                       lang === 'gu' ? '🇮🇳 Gujarati' :
                       lang === 'kn' ? '🇮🇳 Kannada' :
                       lang === 'ml' ? '🇮🇳 Malayalam' :
                       lang === 'pa' ? '🇮🇳 Punjabi' : lang.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Emotion Selection (Chatterbox only) */}
            {ttsProvider === 'chatterbox' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Smile size={16} className="inline mr-1" />
                  Emotion
                </label>
                <select 
                  value={selectedEmotion}
                  onChange={(e) => setSelectedEmotion(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {(voices?.chatterbox.emotions || ['neutral', 'happy', 'sad', 'angry', 'surprised', 'excited', 'calm']).map(emotion => (
                    <option key={emotion} value={emotion}>
                      {emotion === 'neutral' ? '😐 Neutral' :
                       emotion === 'happy' ? '😊 Happy' :
                       emotion === 'sad' ? '😢 Sad' :
                       emotion === 'angry' ? '😠 Angry' :
                       emotion === 'surprised' ? '😲 Surprised' :
                       emotion === 'excited' ? '🤩 Excited' :
                       emotion === 'calm' ? '😌 Calm' :
                       emotion === 'fearful' ? '😨 Fearful' :
                       emotion === 'confident' ? '😎 Confident' :
                       emotion === 'curious' ? '🤔 Curious' :
                       emotion === 'loving' ? '🥰 Loving' :
                       emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Style Selection (Chatterbox only) */}
            {ttsProvider === 'chatterbox' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Sparkles size={16} className="inline mr-1" />
                  Speaking Style
                </label>
                <select 
                  value={selectedStyle}
                  onChange={(e) => setSelectedStyle(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {(voices?.chatterbox.styles || ['default', 'casual', 'formal', 'cheerful', 'professional']).map(style => (
                    <option key={style} value={style}>
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Speed Control */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Gauge size={16} className="inline mr-1" />
                Speed: {ttsSpeed.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={ttsSpeed}
                onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
              </div>
            </div>

            {/* Chatterbox Advanced Parameters */}
            {ttsProvider === 'chatterbox' && (
              <>
                {/* Exaggeration Control */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Zap size={16} className="inline mr-1" />
                    Exaggeration: {ttsExaggeration.toFixed(1)} 
                    <span className="text-xs text-gray-500 ml-2">(Expression intensity)</span>
                  </label>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.1"
                    value={ttsExaggeration}
                    onChange={(e) => setTtsExaggeration(parseFloat(e.target.value))}
                    className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Subtle</span>
                    <span>Moderate</span>
                    <span>Intense</span>
                  </div>
                </div>

                {/* CFG Weight Control */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Sliders size={16} className="inline mr-1" />
                    CFG Weight: {ttsCfgWeight.toFixed(1)}
                    <span className="text-xs text-gray-500 ml-2">(Quality vs Speed)</span>
                  </label>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.1"
                    value={ttsCfgWeight}
                    onChange={(e) => setTtsCfgWeight(parseFloat(e.target.value))}
                    className="w-full h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Fast</span>
                    <span>Balanced</span>
                    <span>Quality</span>
                  </div>
                </div>

                {/* Pitch Control */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Activity size={16} className="inline mr-1" />
                    Pitch: {ttsPitch.toFixed(1)}x
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={ttsPitch}
                    onChange={(e) => setTtsPitch(parseFloat(e.target.value))}
                    className="w-full h-2 bg-green-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Low</span>
                    <span>Normal</span>
                    <span>High</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Live Testing Section */}
          <div className="mt-6 border-t pt-6">
            <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TestTube size={20} className="text-purple-600" />
              Live Testing & Preview
            </h4>

            <div className="space-y-4">
              {/* Test Text Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Test Text
                </label>
                <textarea
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter text to test voice synthesis..."
                />
              </div>

              {/* Current Settings Preview */}
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-xs font-medium text-purple-900 mb-2">Current Settings:</div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-purple-200 text-purple-900 rounded-full text-xs">
                    {ttsProvider}
                  </span>
                  <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full text-xs">
                    {selectedVoice}
                  </span>
                  {ttsProvider === 'chatterbox' && (
                    <>
                      <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full text-xs">
                        {selectedLanguage}
                      </span>
                      <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full text-xs">
                        {selectedEmotion}
                      </span>
                      <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full text-xs">
                        {selectedStyle}
                      </span>
                      <span className="px-2 py-1 bg-indigo-200 text-indigo-700 rounded-full text-xs">
                        Exag: {ttsExaggeration}
                      </span>
                      <span className="px-2 py-1 bg-indigo-200 text-indigo-700 rounded-full text-xs">
                        CFG: {ttsCfgWeight}
                      </span>
                      <span className="px-2 py-1 bg-green-200 text-green-700 rounded-full text-xs">
                        Pitch: {ttsPitch}
                      </span>
                    </>
                  )}
                  <span className="px-2 py-1 bg-blue-200 text-blue-700 rounded-full text-xs">
                    Speed: {ttsSpeed}x
                  </span>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-700 mb-2">⚡ Quick Presets:</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setTtsExaggeration(0.2);
                      setTtsCfgWeight(0.3);
                      setTtsSpeed(1.1);
                    }}
                    className="px-3 py-1.5 bg-green-500 text-white rounded-md text-xs font-medium hover:bg-green-600 flex items-center gap-1"
                  >
                    <Zap size={12} />
                    Fast (~4s)
                  </button>
                  <button
                    onClick={() => {
                      setTtsExaggeration(0.3);
                      setTtsCfgWeight(0.4);
                      setTtsSpeed(1.0);
                    }}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded-md text-xs font-medium hover:bg-blue-600 flex items-center gap-1"
                  >
                    <Activity size={12} />
                    Balanced (~5s)
                  </button>
                  <button
                    onClick={() => {
                      setTtsExaggeration(0.5);
                      setTtsCfgWeight(0.6);
                      setTtsSpeed(1.0);
                    }}
                    className="px-3 py-1.5 bg-purple-500 text-white rounded-md text-xs font-medium hover:bg-purple-600 flex items-center gap-1"
                  >
                    <Sparkles size={12} />
                    Quality (~6s)
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={generateSpeech}
                  disabled={isGenerating || !ttsText.trim()}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play size={20} />
                      Generate & Preview
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    localStorage.setItem('tts_settings', JSON.stringify({
                      provider: ttsProvider,
                      voice: selectedVoice,
                      language: selectedLanguage,
                      emotion: selectedEmotion,
                      style: selectedStyle,
                      speed: ttsSpeed,
                      exaggeration: ttsExaggeration,
                      cfg_weight: ttsCfgWeight,
                      pitch: ttsPitch,
                    }));
                    alert('✅ Settings saved successfully!');
                  }}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center gap-2"
                >
                  <Download size={20} />
                  Save Settings
                </button>
              </div>

              {/* Performance Info */}
              {lastTtsLatency > 0 && (
                <div className="bg-blue-50 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">
                      Generated in {lastTtsLatency}ms ({(lastTtsLatency / 1000).toFixed(1)}s)
                    </span>
                  </div>
                  <div className="text-xs text-blue-700">
                    {lastTtsLatency < 5000 ? '⚡ Fast' : lastTtsLatency < 8000 ? '✓ Good' : '⚠ Slow'}
                  </div>
                </div>
              )}

              {/* Audio Player & Download */}
              {ttsAudioUrl && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Speaker size={16} className="text-purple-600" />
                    Audio Preview
                  </div>
                  <audio ref={audioRef} controls className="w-full" src={ttsAudioUrl} />
                  <button
                    onClick={downloadAudio}
                    className="w-full py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    Download Audio (WAV)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ASR Settings Tab */}
      {activeTab === 'asr' && (
        <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Mic size={24} className="text-blue-600" />
            Speech Recognition Configuration
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ASR Provider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ASR Engine</label>
              <div className="grid grid-cols-3 gap-3">
                {['whisper', 'cloud', 'hybrid'].map(provider => (
                  <button
                    key={provider}
                    onClick={() => setAsrProvider(provider as typeof asrProvider)}
                    className={`p-4 rounded-lg border-2 text-center transition-all ${
                      asrProvider === provider 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-bold text-gray-900 capitalize">{provider}</div>
                    <div className="text-xs text-gray-500">
                      {provider === 'whisper' ? 'Local GPU' : 
                       provider === 'cloud' ? 'Google/Azure' : 'Auto fallback'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Language Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
              <select 
                value={asrLanguage}
                onChange={(e) => setAsrLanguage(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="auto">🌐 Auto Detect</option>
                <option value="hi">🇮🇳 Hindi</option>
                <option value="en">🇬🇧 English</option>
                <option value="mr">🇮🇳 Marathi</option>
                <option value="ta">🇮🇳 Tamil</option>
                <option value="te">🇮🇳 Telugu</option>
                <option value="bn">🇮🇳 Bengali</option>
              </select>
            </div>

            {/* GPU Info */}
            <div className="col-span-2 bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                <Cpu size={18} />
                GPU Status ({mercuryStatus?.gpus?.length || 0} GPUs)
              </h4>
              {mercuryStatus?.gpus && mercuryStatus.gpus.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mercuryStatus.gpus.map((gpu, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="font-medium text-gray-900 text-sm">{gpu.name}</div>
                      <div className="text-xs text-gray-500 mb-2">{gpu.host}</div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><span className="text-gray-500">Used:</span> <span className="font-medium">{gpu.memoryUsed}</span></div>
                        <div><span className="text-gray-500">Total:</span> <span className="font-medium">{gpu.memoryTotal}</span></div>
                        <div><span className="text-gray-500">Temp:</span> <span className="font-medium">{gpu.temperature}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">Loading GPU information...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Testing Tab */}
      {activeTab === 'test' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ASR Test */}
          <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Mic size={24} className="text-blue-600" />
              Test Speech Recognition
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-center">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`p-6 rounded-full transition-all ${
                    isRecording 
                      ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                      : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  {isRecording ? (
                    <Square size={32} className="text-white" />
                  ) : (
                    <Mic size={32} className="text-white" />
                  )}
                </button>
              </div>
              
              <p className="text-center text-gray-600">
                {isRecording ? 'Recording... Click to stop' : 'Click to start recording'}
              </p>
              
              {audioBlob && (
                <div className="space-y-3">
                  <audio controls className="w-full" src={URL.createObjectURL(audioBlob)} />
                  <button
                    onClick={transcribeAudio}
                    disabled={isTranscribing}
                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isTranscribing ? 'Transcribing...' : 'Transcribe Audio'}
                  </button>
                </div>
              )}
              
              {transcription && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Transcription</div>
                  <div className="text-gray-900">{transcription}</div>
                </div>
              )}
            </div>
          </div>

          {/* TTS Test */}
          <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Volume2 size={24} className="text-purple-600" />
              Test Text-to-Speech
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Text to speak</label>
                <textarea
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter text to convert to speech..."
                />
              </div>
              
              <div className="flex gap-2 flex-wrap text-sm">
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full">{ttsProvider}</span>
                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full">{selectedVoice}</span>
                {ttsProvider === 'chatterbox' && (
                  <>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full">{selectedLanguage}</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full">{selectedEmotion}</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full">{selectedStyle}</span>
                  </>
                )}
              </div>
              
              <button
                onClick={generateSpeech}
                disabled={isGenerating || !ttsText.trim()}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw size={20} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play size={20} />
                    Generate Speech
                  </>
                )}
              </button>
              
              {lastTtsLatency > 0 && (
                <div className="text-center text-sm text-gray-500">
                  Generated in {lastTtsLatency}ms
                </div>
              )}
              
              {ttsAudioUrl && (
                <div className="space-y-2">
                  <audio ref={audioRef} controls className="w-full" src={ttsAudioUrl} />
                  <button
                    onClick={downloadAudio}
                    className="w-full py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    Download Audio (WAV)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Hidden audio element for auto-play */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
