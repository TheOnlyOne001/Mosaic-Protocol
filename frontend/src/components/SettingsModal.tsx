'use client';

import { useState, useEffect } from 'react';
import { X, Key, Eye, EyeOff, Save, Trash2, CheckCircle, AlertCircle, Server } from 'lucide-react';

interface APIKeys {
  groqApiKey: string;
  anthropicApiKey: string;
  perplexityApiKey: string;
  backendUrl: string;
}

const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://mosaic-protocol.onrender.com';

const STORAGE_KEY = 'mosaic_api_keys';

export function getStoredAPIKeys(): APIKeys {
  if (typeof window === 'undefined') {
    return {
      groqApiKey: '',
      anthropicApiKey: '',
      perplexityApiKey: '',
      backendUrl: DEFAULT_BACKEND_URL,
    };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        groqApiKey: parsed.groqApiKey || '',
        anthropicApiKey: parsed.anthropicApiKey || '',
        perplexityApiKey: parsed.perplexityApiKey || '',
        backendUrl: parsed.backendUrl || DEFAULT_BACKEND_URL,
      };
    }
  } catch (e) {
    console.error('Failed to parse stored API keys:', e);
  }
  
  return {
    groqApiKey: '',
    anthropicApiKey: '',
    perplexityApiKey: '',
    backendUrl: DEFAULT_BACKEND_URL,
  };
}

export function getBackendUrl(): string {
  return getStoredAPIKeys().backendUrl;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [keys, setKeys] = useState<APIKeys>({
    groqApiKey: '',
    anthropicApiKey: '',
    perplexityApiKey: '',
    backendUrl: DEFAULT_BACKEND_URL,
  });
  
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (isOpen) {
      setKeys(getStoredAPIKeys());
      setSaved(false);
      setConnectionStatus('idle');
    }
  }, [isOpen]);

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save API keys:', e);
    }
  };

  const handleClear = () => {
    const cleared = {
      groqApiKey: '',
      anthropicApiKey: '',
      perplexityApiKey: '',
      backendUrl: DEFAULT_BACKEND_URL,
    };
    setKeys(cleared);
    localStorage.removeItem(STORAGE_KEY);
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    
    try {
      const response = await fetch(`${keys.backendUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
    } catch (e) {
      setConnectionStatus('error');
    } finally {
      setTestingConnection(false);
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (!isOpen) return null;

  const inputFields = [
    {
      key: 'groqApiKey',
      label: 'Groq API Key',
      placeholder: 'gsk_...',
      description: 'Fast LLM inference (recommended)',
      link: 'https://console.groq.com/keys',
    },
    {
      key: 'anthropicApiKey',
      label: 'Anthropic API Key',
      placeholder: 'sk-ant-...',
      description: 'Claude models for complex reasoning',
      link: 'https://console.anthropic.com/settings/keys',
    },
    {
      key: 'perplexityApiKey',
      label: 'Perplexity API Key',
      placeholder: 'pplx-...',
      description: 'Web search and research',
      link: 'https://www.perplexity.ai/settings/api',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'rgba(6, 6, 8, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
        onClick={onClose}
      />
      
      {/* Modal Card - Premium Glassmorphism */}
      <div 
        className="relative w-full max-w-lg overflow-hidden"
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-5"
          style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(255,138,0,0.2) 0%, rgba(255,59,107,0.2) 100%)',
                border: '1px solid rgba(255, 138, 0, 0.3)',
              }}
            >
              <Key className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white">API Settings</h2>
              <p className="text-[11px] text-white/40">Configure your API keys</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-all duration-200 hover:scale-105"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Info Banner */}
          <div 
            className="p-4 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(255,138,0,0.08) 0%, rgba(255,59,107,0.08) 100%)',
              border: '1px solid rgba(255, 138, 0, 0.15)',
            }}
          >
            <p className="text-[13px] text-white/70 leading-relaxed">
              Enter your API keys to use your own accounts. Keys are stored locally in your browser and sent securely with each request.
            </p>
          </div>

          {/* Backend URL */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[13px] font-medium text-white/60">
              <Server className="w-3.5 h-3.5 text-orange-400/70" />
              Backend URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keys.backendUrl}
                onChange={(e) => setKeys(prev => ({ ...prev, backendUrl: e.target.value }))}
                placeholder={DEFAULT_BACKEND_URL}
                className="flex-1 px-4 py-3 text-[13px] text-white placeholder-white/30 
                          focus:outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                }}
              />
              <button
                onClick={testConnection}
                disabled={testingConnection}
                className="px-4 py-3 text-[12px] font-medium text-white/70 
                          disabled:opacity-50 transition-all duration-200 hover:scale-[1.02]
                          flex items-center gap-2"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                }}
              >
                {testingConnection ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-orange-400 rounded-full animate-spin" />
                ) : connectionStatus === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : connectionStatus === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : (
                  'Test'
                )}
              </button>
            </div>
            {connectionStatus === 'success' && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                Connected successfully
              </p>
            )}
            {connectionStatus === 'error' && (
              <p className="text-[11px] text-red-400">Connection failed. Check URL and ensure backend is running.</p>
            )}
          </div>

          {/* API Key Fields */}
          {inputFields.map((field, index) => (
            <div key={field.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-medium text-white/60">
                  {field.label}
                </label>
                <a
                  href={field.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-orange-400/80 hover:text-orange-400 transition-colors"
                >
                  Get key →
                </a>
              </div>
              <div className="relative">
                <input
                  type={showKeys[field.key] ? 'text' : 'password'}
                  value={keys[field.key as keyof APIKeys]}
                  onChange={(e) => setKeys(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-4 py-3 pr-12 text-[13px] text-white placeholder-white/25
                            focus:outline-none transition-all duration-200"
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                  }}
                />
                <button
                  onClick={() => toggleShowKey(field.key)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg 
                            transition-all duration-200 hover:bg-white/5"
                >
                  {showKeys[field.key] ? (
                    <EyeOff className="w-4 h-4 text-white/30" />
                  ) : (
                    <Eye className="w-4 h-4 text-white/30" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-white/30">{field.description}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div 
          className="flex items-center justify-between p-5"
          style={{ 
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-red-400/80 
                      hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
          
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-[12px]">
                <CheckCircle className="w-4 h-4" />
                Saved!
              </span>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-white 
                        rounded-xl transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, rgba(255,138,0,0.9) 0%, rgba(255,59,107,0.9) 100%)',
                boxShadow: '0 4px 20px rgba(255,100,50,0.3)',
              }}
            >
              <Save className="w-4 h-4" />
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
