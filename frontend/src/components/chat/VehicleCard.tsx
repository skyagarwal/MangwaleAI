import { useState } from 'react'
import Image from 'next/image'
import { Package, ArrowRight } from 'lucide-react'

interface VehicleCardProps {
  id: string
  name: string
  description?: string
  image?: string
  pricePerKm?: number
  minimumCharge?: number
  ordersCount?: number
  onSelect: (id: string) => void
}

// Fallback emoji when image fails to load — derived from vehicle name
const VEHICLE_EMOJIS: Record<string, string> = {
  bike: '🏍️',
  auto: '🛺',
  'mini-truck': '🚐',
  'mini truck': '🚐',
  truck: '🚛',
  pickup: '🚛',
  van: '🚐',
  wheeler: '🛺',
  tempo: '🚐',
  default: '📦',
}

function getVehicleEmoji(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, emoji] of Object.entries(VEHICLE_EMOJIS)) {
    if (lower.includes(key)) return emoji
  }
  return VEHICLE_EMOJIS.default
}

export function VehicleCard({
  id,
  name,
  description,
  image,
  pricePerKm,
  minimumCharge,
  ordersCount,
  onSelect,
}: VehicleCardProps) {
  const [imageError, setImageError] = useState(false)

  // Format description — replace \r\n and \n with line breaks
  const descLines = description
    ? description.replace(/\r\n/g, '\n').split('\n').filter(Boolean)
    : []

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden w-full transition-all hover:shadow-md">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 flex items-center gap-2">
        <Package className="w-4 h-4 text-white" />
        <span className="text-white font-semibold text-sm truncate">{name}</span>
      </div>

      {/* Image / emoji fallback */}
      <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-blue-50 to-slate-50">
        {imageError || !image ? (
          <div className="w-full h-full flex items-center justify-center text-5xl">
            {getVehicleEmoji(name)}
          </div>
        ) : (
          <Image
            src={image}
            alt={name}
            fill
            className="object-contain p-2"
            onError={() => setImageError(true)}
            loading="lazy"
            sizes="(max-width: 640px) 45vw, 200px"
          />
        )}
      </div>

      {/* Details */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Description from PHP */}
        {descLines.length > 0 && (
          <div className="text-xs text-gray-500 leading-relaxed">
            {descLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}

        {/* Pricing row */}
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-2">
          <div>
            <p className="text-lg font-bold text-gray-900">
              ₹{pricePerKm ?? '—'}<span className="text-xs font-normal text-gray-500">/km</span>
            </p>
            {minimumCharge != null && (
              <p className="text-[10px] text-gray-400">Min: ₹{minimumCharge}</p>
            )}
          </div>
          {ordersCount != null && ordersCount > 0 && (
            <p className="text-[10px] text-gray-400">{ordersCount.toLocaleString()} deliveries</p>
          )}
        </div>
      </div>

      {/* Select button */}
      <div className="px-3 pb-3">
        <button
          onClick={() => onSelect(id)}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5"
        >
          <span>Select</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
