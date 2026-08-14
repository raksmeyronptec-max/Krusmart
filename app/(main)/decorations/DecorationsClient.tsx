'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, Download, FileText, Monitor, Layout, File, X, Image as ImageIcon } from 'lucide-react';
import { materialsData, DecorationMaterial, MaterialSize } from '@/lib/data/decorations';
import Image from 'next/image';

const CATEGORIES = [
  "all",
  "អក្សរសាស្ត្រ និងភាសា",
  "គណិតវិទ្យា",
  "ពេលវេលា",
  "វិទ្យាសាស្ត្រ",
  "សីលធម៌ និងសង្គម",
  "ចរាចរណ៍",
  "ផ្សេងៗ"
];

export default function DecorationsClient() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedMaterial, setSelectedMaterial] = useState<DecorationMaterial | null>(null);

  const filteredMaterials = useMemo(() => {
    return materialsData.filter((material) => {
      const matchesSearch = material.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || material.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  const getIconForSize = (iconName: string) => {
    switch (iconName) {
      case 'monitor': return <Monitor className="w-5 h-5" />;
      case 'layout': return <Layout className="w-5 h-5" />;
      case 'file': return <File className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header Section */}
      <div className="text-center mb-10">
        <h1 className="text-2xl md:text-4xl py-4 mb-3 font-moul bg-gradient-to-r from-blue-700 via-blue-500 to-blue-700 bg-clip-text text-transparent">
          សម្ភារៈតុបតែងថ្នាក់រៀន (PDF)
        </h1>
        <p className="text-gray-500 mb-6">ទាញយកឯកសារសម្រាប់បោះពុម្ព និងតុបតែងថ្នាក់រៀនរបស់អ្នក</p>
        
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row gap-4 relative">
          <div className="relative flex-grow">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="search"
              placeholder="ស្វែងរកសម្ភារៈតុបតែង..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none shadow-sm transition-all"
            />
          </div>
          <div className="w-full md:w-1/3 relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none shadow-sm appearance-none font-bold"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'មុខវិជ្ជាទាំងអស់' : cat}
                </option>
              ))}
            </select>
            <Filter className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filteredMaterials.map((material) => (
          <div 
            key={material.id}
            onClick={() => setSelectedMaterial(material)}
            className="group bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer flex flex-col transform hover:-translate-y-1"
          >
            <div className="relative h-48 w-full bg-blue-50/50 flex items-center justify-center p-4 border-b border-gray-100 overflow-hidden">
              {material.preview.startsWith('http') || material.preview.startsWith('preview') || material.preview.startsWith('/') ? (
                <img
                  src={material.preview.startsWith('preview') ? `/${material.preview}` : material.preview}
                  alt={material.title}
                  className="max-h-full max-w-full object-contain drop-shadow-md group-hover:scale-110 transition-transform duration-500"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/fallback-image.png'; // Make sure you have a fallback if needed
                  }}
                />
              ) : (
                <ImageIcon className="w-12 h-12 text-blue-200" />
              )}
              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur text-[10px] font-black px-2.5 py-1 rounded-full text-blue-700 shadow-sm border border-blue-100">
                {material.size}
              </div>
            </div>
            <div className="p-5 flex-grow flex flex-col">
              <span className="text-[10px] font-bold text-blue-600 mb-2 uppercase tracking-wider">
                {material.category}
              </span>
              <h3 className="font-bold text-gray-800 line-clamp-2 leading-snug flex-grow">
                {material.title}
              </h3>
              <div className="mt-4 flex items-center justify-between text-xs font-bold text-gray-500">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4" /> 
                  {material.sizes.length} ជម្រើស
                </span>
                <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Download className="w-4 h-4" />
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredMaterials.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <FileText className="mx-auto w-12 h-12 mb-3 opacity-30" />
          <p className="text-lg">រកមិនឃើញឯកសារដែលអ្នកស្វែងរកទេ</p>
        </div>
      )}

      {/* Modal */}
      {selectedMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setSelectedMaterial(null)}
              className="absolute top-4 right-4 z-10 bg-gray-100/80 hover:bg-gray-200 text-gray-600 rounded-full p-2 backdrop-blur-sm transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="md:w-1/2 bg-gray-50 flex items-center justify-center p-6 border-b md:border-b-0 md:border-r border-gray-200">
              <img
                src={selectedMaterial.preview.startsWith('preview') ? `/${selectedMaterial.preview}` : selectedMaterial.preview}
                alt={selectedMaterial.title}
                className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-sm"
              />
            </div>

            <div className="md:w-1/2 p-6 md:p-8 flex flex-col overflow-y-auto">
              <span className="text-xs font-bold text-blue-600 mb-2 uppercase tracking-wider inline-block">
                {selectedMaterial.category}
              </span>
              <h2 className="text-2xl font-moul text-gray-900 mb-2 leading-tight">
                {selectedMaterial.title}
              </h2>
              <p className="text-gray-500 mb-8 flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4" /> ទំហំឯកសារសរុប: <span className="font-bold text-gray-700">{selectedMaterial.size}</span>
              </p>

              <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100/50">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Download className="w-5 h-5 text-blue-600" /> 
                  ជ្រើសរើសទំហំទាញយក
                </h3>
                
                <div className="flex flex-col gap-3">
                  {selectedMaterial.sizes.map((size, idx) => (
                    <a
                      key={idx}
                      href={size.file}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative overflow-hidden bg-white hover:bg-blue-600 border border-gray-200 hover:border-blue-600 p-4 rounded-xl flex items-center justify-between transition-all duration-300 shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-center gap-4 relative z-10 group-hover:text-white transition-colors">
                        <div className="p-2 bg-blue-50 group-hover:bg-blue-500/30 rounded-lg text-blue-600 group-hover:text-white transition-colors">
                          {getIconForSize(size.icon)}
                        </div>
                        <div>
                          <p className="font-black text-sm text-gray-800 group-hover:text-white transition-colors">
                            {size.name}
                          </p>
                          <p className="text-[10px] text-gray-500 group-hover:text-blue-100 transition-colors mt-0.5 font-medium">
                            {size.desc}
                          </p>
                        </div>
                      </div>
                      <div className="bg-gray-50 group-hover:bg-white/20 text-gray-400 group-hover:text-white p-2 rounded-lg transition-colors relative z-10">
                        <Download className="w-4 h-4" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
