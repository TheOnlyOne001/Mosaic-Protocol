'use client';

import { useState } from 'react';
import { X, Book, ChevronRight, Search, FileText, Network, Shield, DollarSign, Zap, Bot, Terminal } from 'lucide-react';
import { DOCS_SECTIONS } from '@/lib/docsContent';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ICON_MAP: Record<string, any> = {
  Book,
  Network,
  Bot,
  FileText,
  DollarSign,
  Shield,
  Zap,
  Terminal
};

export function DocsModal({ isOpen, onClose }: DocsModalProps) {
  const [selectedSection, setSelectedSection] = useState(DOCS_SECTIONS[0].id);
  const [selectedSubsection, setSelectedSubsection] = useState(DOCS_SECTIONS[0].subsections[0].id);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const currentSection = DOCS_SECTIONS.find(s => s.id === selectedSection);
  const currentSubsection = currentSection?.subsections.find(ss => ss.id === selectedSubsection);

  const renderContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-2" />;
      
      if (line.startsWith('###')) {
        return <h4 key={i} className="text-sm font-semibold text-white/90 mt-6 mb-2">{line.replace(/^###\s*/, '')}</h4>;
      }
      if (line.startsWith('##')) {
        return <h3 key={i} className="text-base font-bold text-white mt-8 mb-3">{line.replace(/^##\s*/, '')}</h3>;
      }
      if (line.startsWith('#')) {
        return <h2 key={i} className="text-xl font-bold text-white mt-8 mb-4">{line.replace(/^#\s*/, '')}</h2>;
      }
      
      if (line.startsWith('```')) {
        const isEnd = line === '```';
        return <div key={i} className={isEnd ? 'mb-4' : 'mt-2'} />;
      }
      
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i} className="text-sm font-semibold text-white/90 mb-2">{line.replace(/\*\*/g, '')}</p>;
      }
      
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <div key={i} className="flex gap-2 mb-1.5 ml-4">
            <span className="text-orange-400 mt-1">•</span>
            <span className="text-sm text-white/70 leading-relaxed">{line.replace(/^[-*]\s*/, '').replace(/\*\*/g, '')}</span>
          </div>
        );
      }
      
      if (line.trim().startsWith('`') && line.trim().endsWith('`')) {
        return (
          <code key={i} className="block bg-white/5 border border-white/10 rounded px-3 py-2 text-xs font-mono text-cyan-300 my-2">
            {line.trim().replace(/`/g, '')}
          </code>
        );
      }
      
      return <p key={i} className="text-sm text-white/60 leading-relaxed mb-2">{line}</p>;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      <div 
        className="relative w-full max-w-6xl h-[85vh] flex rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(10,10,15,0.95) 0%, rgba(5,5,8,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Sidebar - Navigation */}
        <div 
          className="w-72 border-r border-white/10 flex flex-col"
          style={{ background: 'rgba(0,0,0,0.3)' }}
        >
          {/* Header */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                <Book className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Documentation</h2>
                <p className="text-xs text-white/40">Mosaic Protocol</p>
              </div>
            </div>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Search docs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50"
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto p-4">
            <nav className="space-y-1">
              {DOCS_SECTIONS.map((section) => {
                const Icon = ICON_MAP[section.icon];
                const isActive = selectedSection === section.id;
                
                return (
                  <div key={section.id}>
                    <button
                      onClick={() => {
                        setSelectedSection(section.id);
                        setSelectedSubsection(section.subsections[0].id);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                        isActive 
                          ? 'bg-orange-500/15 text-white border border-orange-500/30' 
                          : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium flex-1 text-left">{section.title}</span>
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isActive ? 'rotate-90' : ''}`} />
                    </button>
                    
                    {isActive && (
                      <div className="ml-7 mt-1 space-y-0.5">
                        {section.subsections.map((sub) => (
                          <button
                            key={sub.id}
                            onClick={() => setSelectedSubsection(sub.id)}
                            className={`w-full text-left px-3 py-1.5 rounded text-xs transition-all ${
                              selectedSubsection === sub.id
                                ? 'text-orange-400 bg-orange-500/10'
                                : 'text-white/50 hover:text-white/70 hover:bg-white/5'
                            }`}
                          >
                            {sub.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/10">
            <div className="text-xs text-white/40 space-y-1">
              <p>Version 1.0.0</p>
              <p>Built for Capx Hackathon</p>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/10">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{currentSubsection?.title}</h1>
              <p className="text-sm text-white/40">{currentSection?.title}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-3xl prose prose-invert">
              {currentSubsection && renderContent(currentSubsection.content)}
            </div>
          </div>

          {/* Bottom Navigation */}
          <div className="flex items-center justify-between px-8 py-4 border-t border-white/10">
            <button
              onClick={() => {
                const currentSectionIndex = DOCS_SECTIONS.findIndex(s => s.id === selectedSection);
                const currentSubIndex = currentSection?.subsections.findIndex(ss => ss.id === selectedSubsection) || 0;
                
                if (currentSubIndex > 0) {
                  setSelectedSubsection(currentSection!.subsections[currentSubIndex - 1].id);
                } else if (currentSectionIndex > 0) {
                  const prevSection = DOCS_SECTIONS[currentSectionIndex - 1];
                  setSelectedSection(prevSection.id);
                  setSelectedSubsection(prevSection.subsections[prevSection.subsections.length - 1].id);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30"
              disabled={selectedSection === DOCS_SECTIONS[0].id && selectedSubsection === DOCS_SECTIONS[0].subsections[0].id}
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Previous
            </button>
            
            <button
              onClick={() => {
                const currentSectionIndex = DOCS_SECTIONS.findIndex(s => s.id === selectedSection);
                const currentSubIndex = currentSection?.subsections.findIndex(ss => ss.id === selectedSubsection) || 0;
                
                if (currentSubIndex < (currentSection?.subsections.length || 0) - 1) {
                  setSelectedSubsection(currentSection!.subsections[currentSubIndex + 1].id);
                } else if (currentSectionIndex < DOCS_SECTIONS.length - 1) {
                  const nextSection = DOCS_SECTIONS[currentSectionIndex + 1];
                  setSelectedSection(nextSection.id);
                  setSelectedSubsection(nextSection.subsections[0].id);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-all disabled:opacity-30"
              disabled={
                selectedSection === DOCS_SECTIONS[DOCS_SECTIONS.length - 1].id && 
                selectedSubsection === DOCS_SECTIONS[DOCS_SECTIONS.length - 1].subsections[DOCS_SECTIONS[DOCS_SECTIONS.length - 1].subsections.length - 1].id
              }
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
