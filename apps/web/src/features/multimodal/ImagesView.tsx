import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image, ImagePlus, Wand2, Download, Trash2, ZoomIn, Star, Sparkles, Palette, Copy, Check, Settings, RefreshCw, X
} from 'lucide-react';

interface GeneratedImage {
  id: string;
  prompt: string;
  url: string;
  provider: string;
  model: string;
  createdAt: string;
  size: string;
  style: string;
  isFavorite: boolean;
}

const DEMO_IMAGES: GeneratedImage[] = [
  {
    id: 'img-1',
    prompt: 'A futuristic cityscape at sunset with flying cars and neon lights, cyberpunk style, highly detailed, 8k resolution',
    url: 'https://images.unsplash.com/photo-1515630278258-407f66498911?w=512&h=512&fit=crop',
    provider: 'DALL-E 3',
    model: 'dall-e-3',
    createdAt: '2 hours ago',
    size: '1024x1024',
    style: 'cyberpunk',
    isFavorite: true,
  },
  {
    id: 'img-2',
    prompt: 'A serene Japanese garden with cherry blossoms, a small wooden bridge over a koi pond, soft morning light, watercolor painting style',
    url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=512&h=512&fit=crop',
    provider: 'Stable Diffusion',
    model: 'sd-xl',
    createdAt: '5 hours ago',
    size: '1024x1024',
    style: 'watercolor',
    isFavorite: false,
  },
  {
    id: 'img-3',
    prompt: 'A minimalist logo for a tech startup called "Nexus", geometric shapes, blue and white gradient, professional, clean design',
    url: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=512&h=512&fit=crop',
    provider: 'DALL-E 3',
    model: 'dall-e-3',
    createdAt: '1 day ago',
    size: '1024x1024',
    style: 'minimalist',
    isFavorite: false,
  },
  {
    id: 'img-4',
    prompt: 'An astronaut floating in space surrounded by galaxies and nebulae, realistic photography style, dramatic lighting, cinematic composition',
    url: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=512&h=512&fit=crop',
    provider: 'Stable Diffusion',
    model: 'sd-xl',
    createdAt: '2 days ago',
    size: '1024x1024',
    style: 'photorealistic',
    isFavorite: true,
  },
  {
    id: 'img-5',
    prompt: 'A cozy library interior with floor-to-ceiling bookshelves, warm fireplace, leather armchairs, autumn atmosphere, oil painting style',
    url: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=512&h=512&fit=crop',
    provider: 'DALL-E 3',
    model: 'dall-e-3',
    createdAt: '3 days ago',
    size: '1024x1024',
    style: 'oil painting',
    isFavorite: false,
  },
];

const PROVIDERS = [
  { id: 'dall-e-3', name: 'DALL-E 3', description: 'Best quality, detailed images', color: 'bg-blue-500/10 text-blue-400' },
  { id: 'sd-xl', name: 'Stable Diffusion XL', description: 'Open source, customizable', color: 'bg-green-500/10 text-green-400' },
  { id: 'pollinations', name: 'Pollinations', description: 'Free, fast generation', color: 'bg-purple-500/10 text-purple-400' },
];

const STYLES = ['Photorealistic', 'Digital Art', 'Oil Painting', 'Watercolor', 'Anime', '3D Render', 'Minimalist', 'Cyberpunk', 'Fantasy', 'Cinematic'];

const SIZES = ['512x512', '768x768', '1024x1024', '1024x768', '768x1024', '1792x1024'];

export default function ImagesView() {
  const [images, setImages] = useState<GeneratedImage[]>(DEMO_IMAGES);
  const [prompt, setPrompt] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('dall-e-3');
  const [selectedStyle, setSelectedStyle] = useState('Photorealistic');
  const [selectedSize, setSelectedSize] = useState('1024x1024');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateImage = () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setTimeout(() => {
      const newImage: GeneratedImage = {
        id: `img-${Date.now()}`,
        prompt,
        url: `https://source.unsplash.com/random/512x512?${encodeURIComponent(prompt.split(' ').slice(0, 3).join(','))}`,
        provider: PROVIDERS.find((p) => p.id === selectedProvider)?.name || 'AI',
        model: selectedProvider,
        createdAt: 'Just now',
        size: selectedSize,
        style: selectedStyle.toLowerCase(),
        isFavorite: false,
      };
      setImages((prev) => [newImage, ...prev]);
      setIsGenerating(false);
      setPrompt('');
    }, 3000);
  };

  const toggleFavorite = (imageId: string) => {
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, isFavorite: !img.isFavorite } : img))
    );
  };

  const deleteImage = (imageId: string) => {
    setImages((prev) => prev.filter((img) => img.id !== imageId));
    if (selectedImage?.id === imageId) setSelectedImage(null);
  };

  const copyPrompt = (promptText: string) => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredImages = showFavorites ? images.filter((img) => img.isFavorite) : images;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <AnimatedIcon icon={Image} size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Image Generation</h1>
              <p className="text-xs text-muted-foreground">
                {images.length} images · {images.filter((i) => i.isFavorite).length} favorites
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFavorites(!showFavorites)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                showFavorites ? 'bg-amber-500/10 text-amber-500' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <AnimatedIcon icon={Star} size={12} /> {showFavorites ? 'All' : 'Favorites'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Generation Panel */}
        <div className="w-96 border-r border-border flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                className="w-full h-24 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Provider</label>
              <div className="space-y-2">
                {PROVIDERS.map((provider) => (
                  <div
                    key={provider.id}
                    onClick={() => setSelectedProvider(provider.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border ${
                      selectedProvider === provider.id ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${provider.color} flex items-center justify-center`}>
                      <AnimatedIcon icon={Image} size={14} />
                    </div>
                    <div>
                      <h3 className="text-xs font-medium text-foreground">{provider.name}</h3>
                      <p className="text-[10px] text-muted-foreground">{provider.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Style</label>
              <div className="flex flex-wrap gap-1.5">
                {STYLES.map((style) => (
                  <button
                    key={style}
                    onClick={() => setSelectedStyle(style)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                      selectedStyle === style ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Size</label>
              <div className="flex flex-wrap gap-1.5">
                {SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                      selectedSize === size ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={generateImage}
              disabled={!prompt.trim() || isGenerating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
                  />
                  Generating...
                </>
              ) : (
                <>
                  <AnimatedIcon icon={Wand2} size={14} /> Generate Image
                </>
              )}
            </button>
          </div>
        </div>

        {/* Gallery */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {filteredImages.map((image) => (
                <motion.div
                  key={image.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative aspect-square bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/30 transition-all"
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={image.url}
                    alt={image.prompt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-3">
                    <p className="text-[10px] text-white/80 line-clamp-2 mb-2">{image.prompt}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-white/60">{image.provider}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(image.id); }}
                          className="p-1 rounded hover:bg-white/20 transition-all"
                        >
                          <AnimatedIcon icon={Star} size={12} className={image.isFavorite ? 'text-amber-400 fill-amber-400' : 'text-white/60'} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteImage(image.id); }}
                          className="p-1 rounded hover:bg-white/20 transition-all"
                        >
                          <AnimatedIcon icon={Trash2} size={12} className="text-white/60" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredImages.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <AnimatedIcon icon={Image} size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No images yet</p>
                <p className="text-xs mt-1 opacity-60">Generate your first image using the panel on the left</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-4xl max-h-[90vh] flex flex-col bg-card border border-border rounded-xl overflow-hidden"
            >
              <div className="relative flex-1 min-h-0">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.prompt}
                  className="w-full h-full object-contain max-h-[60vh]"
                />
                <button
                  onClick={() => setSelectedImage(null)}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-all"
                >
                  <AnimatedIcon icon={X} size={16} />
                </button>
              </div>
              <div className="p-4 border-t border-border">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground mb-2">{selectedImage.prompt}</p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{selectedImage.provider}</span>
                      <span>{selectedImage.size}</span>
                      <span>{selectedImage.style}</span>
                      <span>{selectedImage.createdAt}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => copyPrompt(selectedImage.prompt)}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                    >
                      {copied ? <AnimatedIcon icon={Check} size={14} className="text-green-500" /> : <AnimatedIcon icon={Copy} size={14} />}
                    </button>
                    <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                      <AnimatedIcon icon={Download} size={14} />
                    </button>
                    <button
                      onClick={() => toggleFavorite(selectedImage.id)}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                    >
                      <AnimatedIcon icon={Star} size={14} className={selectedImage.isFavorite ? 'text-amber-400 fill-amber-400' : ''} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
