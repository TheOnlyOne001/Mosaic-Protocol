'use client';

import { useState, useEffect } from 'react';
import { X, Key, Eye, EyeOff, Save, Trash2, CheckCircle, AlertCircle, Server } from 'lucide-react';

interface APIKeys {
  groqApiKey: string;
  anthropicApiKey: string;
  perplexityApiKey: string;
  backendUrl: string;
}

const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">API Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <p className="text-sm text-purple-200">
              Enter your API keys to use your own accounts. Keys are stored locally in your browser and sent securely with each request.
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <Server className="w-4 h-4" />
              Backend URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keys.backendUrl}
                onChange={(e) => setKeys(prev => ({ ...prev, backendUrl: e.target.value }))}
                placeholder={DEFAULT_BACKEND_URL}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white 
                          placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={testConnection}
                disabled={testingConnection}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white
                          disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                {testingConnection ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : connectionStatus === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : connectionStatus === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : (
                  'Test'
                )}
              </button>
            </div>
            {connectionStatus === 'success' && (
              <p className="text-xs text-green-400">Connected successfully!</p>
            )}
            {connectionStatus === 'error' && (
              <p className="text-xs text-red-400">Connection failed. Check URL and ensure backend is running.</p>
            )}
          </div>

          {inputFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">
                  {field.label}
                </label>
                <a
                  href={field.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-400 hover:text-purple-300"
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
                  className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-600 rounded-lg text-white 
                            placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={() => toggleShowKey(field.key)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-700 rounded"
                >
                  {showKeys[field.key] ? (
                    <EyeOff className="w-4 h-4 text-gray-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500">{field.description}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-gray-700 bg-gray-800/50">
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
          
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                Saved!
              </span>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 
                        text-white rounded-lg transition-colors font-medium"
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
