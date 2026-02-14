import { Star, Clock, MapPin, Plus, Minus } from 'lucide-react'
import Image from 'next/image'
import { useState, useEffect, memo } from 'react'
import type { ProductCard as ProductCardType, VariantOption } from '@/types/chat'

// Multiple image sources for fallback cascade
const IMAGE_SOURCES = [
  'https://mangwale.s3.ap-south-1.amazonaws.com/product',  // S3 bucket-style (primary)
  'https://s3.ap-south-1.amazonaws.com/mangwale/product',  // S3 path-style fallback
  'https://new.mangwale.com/storage/app/public/product',   // PHP Laravel storage
];
const S3_BASE_URL = IMAGE_SOURCES[0]; // Primary source

// Track consecutive image failures PER S3 PREFIX across ALL cards in this page load.
// After 3 failures for a specific prefix, skip image loading for that prefix only.
// This prevents product/ image failures from blocking parcel_category/ images.
const imageFailureCounts: Record<string, number> = {};
const IMAGE_FAILURE_THRESHOLD = 3;

function getImagePrefix(url: string): string {
  try {
    const u = new URL(url);
    // Extract the S3 path prefix (e.g., 'product', 'parcel_category', 'store')
    const parts = u.pathname.split('/').filter(Boolean);
    // For S3 URLs like /product/filename.png → 'product'
    // For /parcel_category/filename.png → 'parcel_category'
    return parts.length > 1 ? parts[parts.length - 2] : 'unknown';
  } catch {
    return 'unknown';
  }
}

function shouldSkipImage(url: string): boolean {
  const prefix = getImagePrefix(url);
  return (imageFailureCounts[prefix] || 0) >= IMAGE_FAILURE_THRESHOLD;
}

function recordImageFailure(url: string): void {
  const prefix = getImagePrefix(url);
  imageFailureCounts[prefix] = (imageFailureCounts[prefix] || 0) + 1;
}

// Food emoji mapping based on item name/category
const FOOD_EMOJIS: Record<string, string> = {
  pizza: '🍕',
  burger: '🍔',
  biryani: '🍚',
  rice: '🍚',
  paratha: '🫓',
  roti: '🫓',
  naan: '🫓',
  dosa: '🥞',
  idli: '🥟',
  samosa: '🥟',
  momos: '🥟',
  thali: '🍱',
  paneer: '🧀',
  chicken: '🍗',
  mutton: '🍖',
  fish: '🐟',
  prawn: '🦐',
  dal: '🥣',
  soup: '🍲',
  noodles: '🍜',
  pasta: '🍝',
  sandwich: '🥪',
  wrap: '🌯',
  roll: '🌯',
  salad: '🥗',
  ice_cream: '🍨',
  dessert: '🍰',
  cake: '🎂',
  sweet: '🍬',
  juice: '🧃',
  lassi: '🥛',
  coffee: '☕',
  tea: '🍵',
  chai: '🍵',
  shake: '🥤',
  drink: '🥤',
  fries: '🍟',
  veg: '🥬',
  default: '🍽️',
};

/**
 * Get appropriate food emoji based on item name
 */
function getFoodEmoji(name?: string): string {
  if (!name) return FOOD_EMOJIS.default;
  const lowerName = name.toLowerCase();
  for (const [key, emoji] of Object.entries(FOOD_EMOJIS)) {
    if (lowerName.includes(key)) {
      return emoji;
    }
  }
  return FOOD_EMOJIS.default;
}

/**
 * Extract just the filename from various image path formats
 */
function extractImageFilename(image: string): string {
  if (!image) return '';
  // Strip known prefixes to get bare filename
  let filename = image;
  if (filename.startsWith('/product/')) filename = filename.replace('/product/', '');
  else if (filename.startsWith('product/')) filename = filename.replace('product/', '');
  // If it's a full URL, extract just the filename part
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    try {
      const url = new URL(filename);
      const parts = url.pathname.split('/');
      filename = parts[parts.length - 1] || filename;
    } catch { /* keep as-is */ }
  }
  return filename;
}

/**
 * Get the full image URL from various image path formats
 * Handles: full URLs, relative paths, filenames
 * CRITICAL: If the image is already a full URL (e.g., from PHP API's image_full_url),
 * use it directly. Only reconstruct /product/ URL for bare filenames.
 */
function getImageUrl(image: string, sourceIndex = 0): string {
  if (!image) return '';
  
  // If it's already a full URL, use it directly on first attempt
  // This preserves paths like /parcel_category/, /store/, etc.
  if (sourceIndex === 0 && (image.startsWith('http://') || image.startsWith('https://'))) {
    return image;
  }
  
  const base = IMAGE_SOURCES[sourceIndex] || IMAGE_SOURCES[0];
  const filename = extractImageFilename(image);
  return `${base}/${filename}`;
}

/**
 * Get next fallback image URL (cycles through IMAGE_SOURCES)
 * For non-/product/ images: try the original URL first, then /product/ fallbacks
 */
function getNextImageUrl(image: string, currentUrl: string): string | null {
  const filename = extractImageFilename(image);
  if (!filename) return null;
  
  // If current URL was the original full URL (non-product path),
  // fall back to /product/ path sources
  const isOriginalFullUrl = image.startsWith('http') && currentUrl === image;
  if (isOriginalFullUrl) {
    return `${IMAGE_SOURCES[0]}/${filename}`;
  }
  
  // Find which product source we're currently on
  const currentSourceIndex = IMAGE_SOURCES.findIndex(src => currentUrl.startsWith(src));
  const nextIndex = currentSourceIndex + 1;
  
  if (nextIndex < IMAGE_SOURCES.length) {
    return `${IMAGE_SOURCES[nextIndex]}/${filename}`;
  }
  return null; // No more fallbacks
}

interface ProductCardProps {
  card: ProductCardType
  onAction: (value: string, variationData?: { item_id: string; quantity?: number; variation?: Array<{ type: string; price: string }>; variationLabel?: string }) => void
  index?: number // For staggered animations
  compact?: boolean // Compact mode for horizontal scroll
  direction?: 'left' | 'right' // Animation direction
}

function ProductCardInner({ card, onAction, index = 0, compact = false, direction = 'left' }: ProductCardProps) {
  // Skip image loading only if this specific image source prefix has too many failures
  const initialUrl = card.image ? getImageUrl(card.image) : '';
  const skipImages = initialUrl ? shouldSkipImage(initialUrl) : true;
  const [imageError, setImageError] = useState(skipImages)
  const [currentImageUrl, setCurrentImageUrl] = useState(() => 
    (!skipImages && card.image) ? initialUrl : ''
  )
  const [isVisible, setIsVisible] = useState(false)
  const [selectedVariation, setSelectedVariation] = useState<{ type: string; price: string; label: string } | null>(null)
  const [quantity, setQuantity] = useState(1)
  
  // Trigger animation on mount with stagger delay - slide from sides
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), index * 80)
    return () => clearTimeout(timer)
  }, [index])
  
  // Handle image error with fallback cascade (per-prefix tracking)
  const handleImageError = () => {
    recordImageFailure(currentImageUrl); // Track failures per S3 prefix
    const nextUrl = getNextImageUrl(card.image, currentImageUrl);
    if (nextUrl && !shouldSkipImage(nextUrl)) {
      setCurrentImageUrl(nextUrl);
    } else {
      setImageError(true);
    }
  };
  
  // Determine if item is veg (handle all field formats)
  // Backend sends: veg: 1 or 0, is_veg: true/false, isVeg: true/false
  // Handle string '0'/'1' from some APIs too
  const isVeg = (() => {
    if (card.isVeg !== undefined && card.isVeg !== null) return !!card.isVeg;
    if (card.is_veg !== undefined && card.is_veg !== null) return !!card.is_veg;
    if (card.veg !== undefined && card.veg !== null) {
      if (typeof card.veg === 'number') return card.veg === 1;
      if (typeof card.veg === 'string') return card.veg === '1' || card.veg.toLowerCase() === 'true';
      return !!card.veg;
    }
    return undefined; // Unknown - don't show indicator
  })();
  const showVegIndicator = isVeg !== undefined && (!card.cardType || card.cardType === 'food')
  
  // Initialize selections with first option of each group
  const [selections, setSelections] = useState<Record<string, VariantOption>>(() => {
    const initial: Record<string, VariantOption> = {}
    if (card.variantGroups) {
      card.variantGroups.forEach(group => {
        if (group.options.length > 0) {
          initial[group.id] = group.options[0]
        }
      })
    }
    return initial
  })

  const handleSelection = (groupId: string, option: VariantOption) => {
    setSelections(prev => ({ ...prev, [groupId]: option }))
  }

  // Handle food variation selection
  const handleFoodVariationSelect = (variation: { name: string; label: string; optionPrice: string }) => {
    setSelectedVariation({
      type: variation.name,
      price: variation.optionPrice,
      label: variation.label
    })
  }

  // Calculate current price (base price + variation price)
  const currentPrice = (() => {
    if (selectedVariation) {
      const basePrice = card.rawPrice || parseFloat(card.price?.replace('₹', '') || '0')
      const variationPrice = parseFloat(selectedVariation.price || '0')
      return `₹${basePrice + variationPrice}`
    }
    
    let price = card.price
    Object.values(selections).forEach(option => {
      if (option.price) price = option.price
    })
    return price
  })()

  // Get food emoji for this item
  const foodEmoji = getFoodEmoji(card.name)

  // Compact card — small tile for 2-column grid layout
  // Mobile-first, Swiggy/Zomato style mini card
  if (compact) {
    const hasVariations = card.has_variant === 1 && card.food_variations && card.food_variations.length > 0
    
    return (
      <div 
        className={`
          bg-white rounded-xl
          w-full
          border border-gray-100 hover:border-orange-200
          transition-all duration-200 ease-out
          overflow-hidden shadow-sm hover:shadow-md
          ${isVisible 
            ? 'opacity-100 translate-y-0' 
            : 'opacity-0 translate-y-3'
          }
        `}
        style={{ transitionDelay: `${index * 40}ms` }}
      >
        {/* Image section - top of card */}
        <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-orange-50 to-amber-50 overflow-hidden">
          {imageError || !card.image ? (
            <div className="w-full h-full flex items-center justify-center text-4xl">
              {foodEmoji}
            </div>
          ) : (
            <Image
              src={currentImageUrl}
              alt={card.name}
              fill
              className="object-cover"
              onError={handleImageError}
              unoptimized
              sizes="(max-width: 640px) 45vw, 180px"
            />
          )}
          {/* Veg/Non-veg badge - top-left */}
          {showVegIndicator && (
            <div className={`absolute top-1.5 left-1.5 w-4 h-4 border-[1.5px] rounded-sm flex items-center justify-center bg-white/90 backdrop-blur-sm ${isVeg ? 'border-green-600' : 'border-red-600'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
            </div>
          )}
          {/* Rating badge - top-right */}
          {card.rating !== undefined && card.rating > 0 && (
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-white/90 backdrop-blur-sm text-[10px] px-1.5 py-0.5 rounded-md shadow-sm">
              <Star className="w-2.5 h-2.5 fill-orange-400 text-orange-400" />
              <span className="font-semibold text-gray-800">{typeof card.rating === 'number' ? card.rating.toFixed(1) : card.rating}</span>
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="px-2 pt-1.5 pb-2">
          {/* Name */}
          <h4 className="font-semibold text-[13px] text-gray-900 leading-tight line-clamp-2 min-h-[32px]">{card.name}</h4>
          
          {/* Store + meta row */}
          <div className="flex items-center gap-1 mt-0.5 min-h-[16px]">
            {card.storeName && (
              <p className="text-[10px] text-gray-500 truncate flex-1">{card.storeName}</p>
            )}
            {card.deliveryTime && (
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5 shrink-0">
                <Clock className="w-2.5 h-2.5" />
                {card.deliveryTime}
              </span>
            )}
          </div>

          {/* Food Variations (compact) - if item has variants */}
          {hasVariations && (
            <div className="mt-1.5">
              {card.food_variations!.map((variation, vIdx) => (
                <div key={vIdx} className="flex flex-wrap gap-1">
                  {variation.values.slice(0, 4).map((option, optIdx) => {
                    const isSelected = selectedVariation?.label === option.label && 
                                     selectedVariation?.type === variation.name
                    const optionPrice = parseFloat(option.optionPrice || '0')
                    
                    return (
                      <button
                        key={optIdx}
                        onClick={() => handleFoodVariationSelect({
                          name: variation.name,
                          label: option.label,
                          optionPrice: option.optionPrice
                        })}
                        className={`px-1.5 py-1 text-[10px] rounded-md border transition-all leading-none ${
                          isSelected 
                            ? 'bg-orange-500 text-white border-orange-500 font-semibold' 
                            : 'bg-gray-50 text-gray-600 border-gray-200 active:bg-orange-50'
                        }`}
                      >
                        {option.label}
                        {optionPrice > 0 && <span className="ml-0.5 opacity-80">+₹{optionPrice}</span>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Price + ADD row */}
          <div className="flex items-center justify-between mt-2 gap-1">
            <div className="flex items-center gap-1 min-w-0">
              {currentPrice && (
                <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{currentPrice}</span>
              )}
              {card.distance && (
                <span className="text-[9px] text-gray-400 truncate">{card.distance}</span>
              )}
            </div>
            
            {/* ADD / Qty controls */}
            {quantity <= 1 ? (
              <button
                onClick={() => {
                  const actionValue = card.action?.value || ''
                  onAction(actionValue, {
                    item_id: card.id,
                    quantity: 1,
                    variation: selectedVariation ? [{
                      type: selectedVariation.type,
                      price: selectedVariation.price
                    }] : undefined,
                    variationLabel: selectedVariation?.label
                  })
                }}
                className="bg-white border-2 border-green-500 text-green-600 hover:bg-green-500 hover:text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-all active:scale-95 shrink-0"
              >
                ADD
              </button>
            ) : (
              <div className="flex items-center border-2 border-green-500 rounded-lg overflow-hidden shrink-0">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-7 h-8 flex items-center justify-center text-green-600 hover:bg-green-50 active:bg-green-100 transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-6 h-8 flex items-center justify-center text-xs font-bold text-gray-900 bg-green-50">{quantity}</span>
                <button
                  onClick={() => {
                    setQuantity(q => {
                      const newQ = Math.min(20, q + 1)
                      // Auto-add on increment
                      const actionValue = card.action?.value || ''
                      onAction(actionValue, {
                        item_id: card.id,
                        quantity: newQ,
                        variation: selectedVariation ? [{
                          type: selectedVariation.type,
                          price: selectedVariation.price
                        }] : undefined,
                        variationLabel: selectedVariation?.label
                      })
                      return newQ
                    })
                  }}
                  className="w-7 h-8 flex items-center justify-center text-green-600 hover:bg-green-50 active:bg-green-100 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Full card for non-compact view
  return (
    <div 
      className={`
        bg-white rounded-2xl 
        shadow-md hover:shadow-xl
        w-full max-w-[280px] sm:max-w-[320px]
        border border-gray-100 hover:border-orange-300 
        transition-all duration-300 ease-out overflow-hidden
        ${isVisible 
          ? 'opacity-100 translate-x-0 scale-100' 
          : `opacity-0 ${direction === 'left' ? '-translate-x-12' : 'translate-x-12'} scale-95`
        }
      `}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <div className="flex gap-3 sm:gap-4 p-3 sm:p-4">
        {/* Left side - Content */}
        <div className="flex-1 min-w-0">
          {/* Name with Veg indicator (only for food cards with known veg status) */}
          <div className="flex items-start gap-2 mb-1 sm:mb-2">
            {showVegIndicator && (
              <div className={`w-4 h-4 sm:w-5 sm:h-5 border-2 rounded-sm flex items-center justify-center flex-shrink-0 mt-0.5 ${isVeg ? 'border-green-600' : 'border-red-600'}`}>
                <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
              </div>
            )}
            <h3 className="font-bold text-base sm:text-lg text-gray-900 truncate">{card.name}</h3>
          </div>
          
          {card.storeName && (
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-1.5 truncate flex items-center gap-1">
              <MapPin className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              {card.storeName}{card.distance && ` • ${card.distance}`}
            </p>
          )}
          
          {/* Rating and delivery time in a row */}
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            {card.rating !== undefined && card.rating > 0 && (
              <div className="flex items-center gap-1 bg-green-600 text-white text-xs sm:text-sm px-1.5 py-0.5 rounded">
                <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-white" />
                <span className="font-semibold">{typeof card.rating === 'number' ? card.rating.toFixed(1) : card.rating}</span>
              </div>
            )}
            {card.deliveryTime && (
              <p className="text-xs sm:text-sm text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                {card.deliveryTime}
              </p>
            )}
          </div>

          {currentPrice && (
            <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">{currentPrice}</p>
          )}

          {/* Food Variations (PHP API) - e.g., 250g, 500g, 1kg */}
          {card.has_variant === 1 && card.food_variations && card.food_variations.length > 0 && (
            <div className="mb-2 sm:mb-3">
              {card.food_variations.map((variation, vIdx) => (
                <div key={vIdx} className="mb-2">
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-500 mb-1 uppercase">
                    {variation.name}
                    {variation.required === 'on' && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {variation.values.map((option, optIdx) => {
                      const isSelected = selectedVariation?.label === option.label && 
                                       selectedVariation?.type === variation.name
                      const basePrice = card.rawPrice || 0
                      const optionPrice = parseFloat(option.optionPrice || '0')
                      const totalPrice = basePrice + optionPrice
                      
                      return (
                        <button
                          key={optIdx}
                          onClick={() => handleFoodVariationSelect({
                            name: variation.name,
                            label: option.label,
                            optionPrice: option.optionPrice
                          })}
                          className={`px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-md border transition-all ${
                            isSelected 
                              ? 'bg-orange-500 text-white border-orange-500 font-semibold' 
                              : 'bg-white text-gray-600 border-gray-300 hover:border-orange-300'
                          }`}
                        >
                          <span>{option.label}</span>
                          {optionPrice !== 0 && (
                            <span className="ml-1 text-[9px] sm:text-[10px]">
                              {optionPrice > 0 ? `+₹${optionPrice}` : `₹${totalPrice}`}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Variants - compact for mobile */}
          {card.variantGroups?.map(group => (
            <div key={group.id} className="mb-2 sm:mb-3">
              <p className="text-[10px] sm:text-xs font-semibold text-gray-500 mb-1 uppercase">{group.name}</p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {group.options.map(option => {
                  const isSelected = selections[group.id]?.id === option.id
                  
                  if (group.type === 'color') {
                    return (
                      <button
                        key={option.id}
                        onClick={() => handleSelection(group.id, option)}
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 transition-all ${
                          isSelected 
                            ? 'border-green-500 ring-1 ring-green-500 scale-110' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        style={{ backgroundColor: option.colorCode || option.value }}
                        title={option.label}
                      />
                    )
                  }
                  
                  return (
                    <button
                      key={option.id}
                      onClick={() => handleSelection(group.id, option)}
                      className={`px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-md border transition-all ${
                        isSelected 
                          ? 'bg-green-600 text-white border-green-600' 
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {card.description && (
            <p className="text-xs sm:text-sm text-gray-500 mb-2 sm:mb-3 line-clamp-2">
              {card.description}
            </p>
          )}

          {/* Quantity selector + ADD */}
          <div className="flex items-center gap-2 w-full">
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-8 h-8 flex items-center justify-center text-orange-500 hover:bg-orange-50 transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-8 h-8 flex items-center justify-center text-sm font-bold text-gray-900 bg-gray-50">{quantity}</span>
              <button
                onClick={() => setQuantity(q => Math.min(20, q + 1))}
                className="w-8 h-8 flex items-center justify-center text-orange-500 hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => {
                const actionValue = card.action?.value || ''
                onAction(actionValue, {
                  item_id: card.id,
                  quantity,
                  variation: selectedVariation ? [{
                    type: selectedVariation.type,
                    price: selectedVariation.price
                  }] : undefined,
                  variationLabel: selectedVariation?.label
                })
                setQuantity(1) // Reset after adding
              }}
              className="flex-1 bg-white border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 text-sm active:scale-95"
            >
              <Plus className="w-4 h-4" />
              ADD
            </button>
          </div>
        </div>

        {/* Right side - Image with emoji fallback and CDN cascade */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 relative">
          <div className="w-full h-full rounded-xl sm:rounded-2xl overflow-hidden bg-gradient-to-br from-orange-50 to-orange-100 shadow-sm flex items-center justify-center">
            {imageError || !card.image ? (
              <div className="w-full h-full flex items-center justify-center text-4xl sm:text-5xl">
                {foodEmoji}
              </div>
            ) : (
              <Image
                src={currentImageUrl}
                alt={card.name}
                width={96}
                height={96}
                className="w-full h-full object-cover"
                onError={handleImageError}
                unoptimized
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Memoize to prevent unnecessary re-renders in chat message list
export const ProductCard = memo(ProductCardInner, (prev, next) => {
  return prev.card.id === next.card.id && prev.compact === next.compact && prev.index === next.index;
});
