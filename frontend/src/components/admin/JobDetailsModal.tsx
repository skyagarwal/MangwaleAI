"use client";

import { useEffect, useState } from "react";
import { X, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface Review {
  authorName: string;
  rating: number;
  text: string;
  date: string;
  likes: number;
}

interface RestaurantDetails {
  name: string;
  rating: number;
  reviewCount: number;
  address: string;
  priceForTwo: number;
  fssaiNumber?: string;
  gstNumber?: string;
}

interface JobDetailsResponse {
  job: {
    id: string;
    source: "zomato" | "swiggy";
    storeName: string;
    status: "pending" | "processing" | "completed" | "failed";
    createdAt?: string;
    completedAt?: string;
    error?: string | null;
    itemsScraped?: number;
    reviewsScraped?: number;
  };
  restaurant?: RestaurantDetails | null;
  reviews?: Review[];
  scrapingMetrics?: {
    startTime?: string;
    endTime?: string;
    duration?: number;
    status?: string;
    itemsFound?: number;
    reviewsFound?: number;
    error?: string | null;
    fssaiNumber?: string;
    gstNumber?: string;
  };
}

export default function JobDetailsModal({
  jobId,
  onClose,
}: {
  jobId: string;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<JobDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/scraper/jobs/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setDetails(data);
        }
      } catch (e) {
        console.error("Failed to fetch job details", e);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [jobId]);

  const statusBadge = (status?: string) => {
    switch (status) {
      case "completed":
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Completed</span>;
      case "failed":
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">Failed</span>;
      case "processing":
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">Processing</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">Pending</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Scrape Job Details</h2>
            {details?.job?.status && statusBadge(details.job.status)}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-[#059211] border-t-transparent rounded-full" />
          </div>
        ) : details ? (
          <div className="p-6 space-y-6">
            {/* Job Meta */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-500">Job ID</div>
                <div className="font-mono text-sm">{details.job.id}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-500">Source</div>
                <div className="text-sm capitalize">{details.job.source}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-500">Created</div>
                <div className="text-sm">
                  {details.scrapingMetrics?.startTime ? new Date(details.scrapingMetrics.startTime).toLocaleString() : "-"}
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-500">Duration</div>
                <div className="text-sm flex items-center gap-1">
                  <Clock size={16} />
                  {details.scrapingMetrics?.duration ? `${Math.round(details.scrapingMetrics.duration)}s` : "-"}
                </div>
              </div>
            </div>

            {/* Error */}
            {details.job.error && (
              <div className="bg-red-50 p-3 rounded border border-red-200 flex items-start gap-2">
                <AlertTriangle size={18} className="text-red-600 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-red-900">Error</div>
                  <div className="text-sm text-red-700">{details.job.error}</div>
                </div>
              </div>
            )}

            {/* Restaurant */}
            {details.restaurant && (
              <div className="bg-gray-50 p-4 rounded">
                <div className="font-semibold mb-2">Restaurant</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Name</div>
                    <div className="font-medium">{details.restaurant.name}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Rating</div>
                    <div className="font-medium">⭐ {details.restaurant.rating}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Reviews</div>
                    <div className="font-medium">{details.restaurant.reviewCount}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Price for Two</div>
                    <div className="font-medium">₹{details.restaurant.priceForTwo}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-gray-500">Address</div>
                    <div className="font-medium">{details.restaurant.address}</div>
                  </div>
                </div>

                {(details.restaurant.fssaiNumber || details.restaurant.gstNumber) && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {details.restaurant.fssaiNumber && (
                      <div className="bg-green-50 p-2 rounded text-xs">
                        <div className="text-gray-600">FSSAI</div>
                        <div className="font-mono font-semibold text-green-700">{details.restaurant.fssaiNumber}</div>
                      </div>
                    )}
                    {details.restaurant.gstNumber && (
                      <div className="bg-blue-50 p-2 rounded text-xs">
                        <div className="text-gray-600">GST</div>
                        <div className="font-mono font-semibold text-blue-700">{details.restaurant.gstNumber}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Metrics */}
            {details.scrapingMetrics && (
              <div className="bg-gray-50 p-4 rounded">
                <div className="font-semibold mb-2">Metrics</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Items Scraped</div>
                    <div className="font-bold">{details.scrapingMetrics.itemsFound ?? details.job.itemsScraped ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Reviews Scraped</div>
                    <div className="font-bold">{details.scrapingMetrics.reviewsFound ?? details.job.reviewsScraped ?? 0}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Reviews */}
            {details.reviews && details.reviews.length > 0 && (
              <div className="bg-gray-50 p-4 rounded">
                <div className="font-semibold mb-2">Recent Reviews</div>
                <div className="space-y-2">
                  {details.reviews.slice(0, 3).map((r, i) => (
                    <div key={i} className="p-3 rounded bg-white border">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium">{r.authorName}</div>
                        <div>⭐ {r.rating}</div>
                      </div>
                      <div className="text-xs text-gray-500 mb-2">{r.date}</div>
                      <div className="text-sm text-gray-700">{r.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">No details available.</div>
        )}

        {/* Footer */}
        <div className="p-4 border-t flex justify-end">
          {details?.job?.status === "completed" && (
            <div className="text-green-600 flex items-center gap-2 mr-3">
              <CheckCircle2 size={18} /> Completed
            </div>
          )}
          {details?.job?.status === "failed" && (
            <div className="text-red-600 flex items-center gap-2 mr-3">
              <XCircle size={18} /> Failed
            </div>
          )}
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">Close</button>
        </div>
      </div>
    </div>
  );
}
