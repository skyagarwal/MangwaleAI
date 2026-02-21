'use client';

import { useEffect, useState, useRef } from 'react';

interface OrderStatus {
  orderId: number;
  status: string;
  step: number; // 1=confirmed, 2=preparing, 3=out_for_delivery, 4=delivered
  storeName?: string;
  deliveryMan?: string;
  eta?: number;
  paymentStatus?: string;
  totalAmount?: number;
}

const STEPS = [
  { step: 1, label: 'Confirmed',      icon: '✅' },
  { step: 2, label: 'Preparing',      icon: '👨‍🍳' },
  { step: 3, label: 'On the Way',     icon: '🚴' },
  { step: 4, label: 'Delivered',      icon: '🎉' },
];

const POLL_INTERVAL = 15_000; // 15 seconds

export default function OrderStatusTracker({
  orderId,
  initialStoreName,
}: {
  orderId: number;
  initialStoreName?: string;
}) {
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/chat/track/${orderId}`);
      const data = await res.json();
      if (data.success) {
        setOrder(data);
        setError(false);
        // Stop polling once delivered
        if (data.step >= 4 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (loading) {
    return (
      <div className="mt-3 p-3 bg-orange-50 border border-orange-100 rounded-2xl animate-pulse">
        <div className="h-4 bg-orange-100 rounded w-1/2 mb-2" />
        <div className="h-3 bg-orange-100 rounded w-3/4" />
      </div>
    );
  }

  if (error || !order) return null;

  const currentStep = order.step;
  const storeName = order.storeName || initialStoreName;

  return (
    <div className="mt-3 p-4 bg-orange-50 border border-orange-200 rounded-2xl text-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-orange-800">
          Order #{order.orderId}
          {storeName ? ` · ${storeName}` : ''}
        </span>
        {order.totalAmount ? (
          <span className="text-orange-600 font-medium">₹{order.totalAmount}</span>
        ) : null}
      </div>

      {/* Step bar */}
      <div className="flex items-center gap-1 mb-3">
        {STEPS.map((s, i) => {
          const done = currentStep > s.step;
          const active = currentStep === s.step;
          return (
            <div key={s.step} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <span className={`text-lg ${active ? 'scale-110' : done ? 'opacity-60' : 'opacity-30'} transition-all`}>
                  {s.icon}
                </span>
                <span className={`text-[10px] mt-0.5 text-center leading-tight ${active ? 'text-orange-700 font-semibold' : done ? 'text-orange-500' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mb-4 ${done || active ? 'bg-orange-400' : 'bg-gray-200'} transition-colors`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Delivery person */}
      {order.deliveryMan && currentStep >= 3 && (
        <p className="text-orange-700 text-xs">
          🚴 <span className="font-medium">{order.deliveryMan}</span> is on the way!
        </p>
      )}

      {/* Delivered */}
      {currentStep >= 4 && (
        <p className="text-green-700 font-medium text-xs mt-1">
          🎉 Delivered! Enjoy your meal!
        </p>
      )}
    </div>
  );
}
