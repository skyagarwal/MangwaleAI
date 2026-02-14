'use client'

import React, { useState } from 'react'
import type { CartUpdateData } from '@/lib/websocket/chat-client'

interface RunningCartProps {
  cart: CartUpdateData | null
  onViewCart?: () => void
  onCheckout?: () => void
}

export default function RunningCart({ cart, onViewCart, onCheckout }: RunningCartProps) {
  const [expanded, setExpanded] = useState(false)

  if (!cart || cart.totalItems === 0) return null

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next && onViewCart) onViewCart()
  }

  return (
    <div className="bg-gradient-to-r from-green-600 to-green-700 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]">
      {/* Expanded cart items */}
      {expanded && (
        <div className="max-h-44 overflow-y-auto bg-white border-b border-gray-100">
          <div className="px-3 pt-2 pb-1 space-y-0">
            {cart.items.map((item, idx) => (
              <div
                key={`${item.id}-${idx}`}
                className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-[13px] text-gray-800 truncate block leading-tight">
                    {item.name}
                    {item.variationLabel && (
                      <span className="text-[10px] text-gray-400 ml-1">({item.variationLabel})</span>
                    )}
                  </span>
                  {item.storeName && (
                    <span className="text-[10px] text-gray-400 block truncate">{item.storeName}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  <span className="text-[11px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 font-medium">
                    ×{item.quantity}
                  </span>
                  <span className="text-[13px] font-bold text-gray-800 w-14 text-right">
                    ₹{(item.price * item.quantity).toFixed(0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cart summary bar — green theme */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={handleToggle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <span className="text-lg">🛒</span>
            <span className="absolute -top-1.5 -right-2 bg-white text-green-700 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
              {cart.totalItems}
            </span>
          </div>
          <div className="ml-0.5 min-w-0">
            <span className="text-[13px] font-semibold text-white">
              {cart.totalItems} {cart.totalItems === 1 ? 'item' : 'items'}
            </span>
            {cart.isMultiStore && (
              <span className="text-[11px] text-green-200 ml-1">
                · {cart.storeCount} stores
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[15px] font-bold text-white">₹{cart.totalPrice.toFixed(0)}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCheckout?.()
            }}
            className="bg-white text-green-700 text-[13px] font-bold px-3.5 py-1.5 rounded-lg hover:bg-green-50 transition-colors active:scale-95 shadow-sm"
          >
            Checkout →
          </button>
          <span className={`text-green-200 text-[10px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            ▲
          </span>
        </div>
      </div>
    </div>
  )
}
