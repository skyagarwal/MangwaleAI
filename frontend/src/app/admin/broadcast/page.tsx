'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Send,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Loader2,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useToast } from '@/components/shared';

interface Campaign {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  audience: string;
  status: 'draft' | 'sending' | 'completed' | 'failed';
  stats: { total: number; sent: number; failed: number };
  createdAt: string;
  completedAt?: string;
}

interface AudienceCount {
  audience: string;
  count: number;
  sample: string[];
}

export default function BroadcastPage() {
  const toast = useToast();
  // ─── State ────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [audienceCount, setAudienceCount] = useState<AudienceCount | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('hi');
  const [audience, setAudience] = useState<'all' | 'recent' | 'inactive' | 'custom'>('recent');
  const [customPhones, setCustomPhones] = useState('');
  const [inactiveDays, setInactiveDays] = useState(7);
  const [recentDays, setRecentDays] = useState(30);

  // ─── API Calls ────────────────────────────────────────────────
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/broadcast/campaigns');
      const data = await res.json();
      if (data.success) setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAudienceCount = useCallback(async (type: string) => {
    if (type === 'custom') {
      setAudienceCount(null);
      return;
    }
    setAudienceLoading(true);
    try {
      const res = await fetch(`/api/broadcast/audience-count/${type}`);
      const data = await res.json();
      if (data.success) setAudienceCount(data);
    } catch (err) {
      console.error('Failed to fetch audience:', err);
    } finally {
      setAudienceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    fetchAudienceCount(audience);
  }, [audience, fetchAudienceCount]);

  // ─── Send Campaign ───────────────────────────────────────────
  const handleSend = async () => {
    if (!templateName.trim()) {
      toast.error('Template name is required');
      return;
    }

    setSending(true);
    try {
      const body: any = {
        name: name || templateName,
        templateName,
        templateLanguage,
        audience,
      };

      if (audience === 'custom') {
        const phones = customPhones
          .split(/[,\n\s]+/)
          .map((p) => p.trim())
          .filter((p) => /^\d{10,15}$/.test(p));
        if (phones.length === 0) {
          toast.error('Enter valid phone numbers (10-15 digits each)');
          setSending(false);
          return;
        }
        body.audienceFilter = { phoneNumbers: phones };
      } else if (audience === 'inactive') {
        body.audienceFilter = { inactiveForDays: inactiveDays };
      } else if (audience === 'recent') {
        body.audienceFilter = { lastActiveWithinDays: recentDays };
      }

      const res = await fetch('/api/broadcast/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Campaign sent successfully!');
        setCampaigns((prev) => [data.campaign, ...prev]);
        setName('');
        setTemplateName('');
        setCustomPhones('');
      } else {
        toast.error(`Send failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────
  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; Icon: any }> = {
      completed: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', Icon: CheckCircle },
      sending: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', Icon: Loader2 },
      failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', Icon: XCircle },
      draft: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', Icon: Clock },
    };
    const style = map[status] || map.draft;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <style.Icon className={`w-3 h-3 ${status === 'sending' ? 'animate-spin' : ''}`} />
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-7 h-7 text-green-600" />
              WhatsApp Broadcast
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Send template messages to your audience via WhatsApp Business API
            </p>
          </div>
          <button
            onClick={fetchCampaigns}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Send Form */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            New Campaign
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Campaign Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Campaign Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Diwali Sale Blast"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {/* Template Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Template Name *
              </label>
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Meta-approved template name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Language
              </label>
              <select
                value={templateLanguage}
                onChange={e => setTemplateLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="hi">Hindi (hi)</option>
                <option value="en">English (en)</option>
                <option value="en_US">English US (en_US)</option>
                <option value="mr">Marathi (mr)</option>
              </select>
            </div>

            {/* Audience */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Audience
              </label>
              <select
                value={audience}
                onChange={e => setAudience(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="recent">Recent Users (Active sessions)</option>
                <option value="all">All Registered Users</option>
                <option value="inactive">Inactive Users</option>
                <option value="custom">Custom Phone List</option>
              </select>
            </div>

            {/* Conditional: Inactive days */}
            {audience === 'inactive' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Inactive For (days)
                </label>
                <input
                  type="number"
                  value={inactiveDays}
                  onChange={e => setInactiveDays(Number(e.target.value))}
                  min={1}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
            )}

            {/* Conditional: Recent days */}
            {audience === 'recent' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Active Within (days)
                </label>
                <input
                  type="number"
                  value={recentDays}
                  onChange={e => setRecentDays(Number(e.target.value))}
                  min={1}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
            )}

            {/* Conditional: Custom phone numbers */}
            {audience === 'custom' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone Numbers (one per line or comma-separated)
                </label>
                <textarea
                  value={customPhones}
                  onChange={e => setCustomPhones(e.target.value)}
                  rows={4}
                  placeholder="9158886329&#10;9876543210&#10;..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Audience Count Preview */}
          {audience !== 'custom' && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-300">
                {audienceLoading ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Counting audience...
                  </span>
                ) : audienceCount ? (
                  <span>
                    <strong>{audienceCount.count}</strong> users match this audience
                    {audienceCount.sample.length > 0 && (
                      <span className="block text-xs opacity-70 mt-0.5">
                        Sample: {audienceCount.sample.join(', ')}
                      </span>
                    )}
                  </span>
                ) : (
                  <span>Select an audience to preview count</span>
                )}
              </div>
            </div>
          )}

          {/* Send Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSend}
              disabled={sending || !templateName.trim()}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition text-sm"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Send Campaign
                </>
              )}
            </button>
          </div>
        </div>

        {/* Campaign History */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              Campaign History
            </h2>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
              <p className="text-sm text-gray-500 mt-2">Loading campaigns...</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No campaigns yet</p>
              <p className="text-sm text-gray-400 mt-1">Send your first broadcast above</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {campaigns.map(c => (
                <div key={c.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {c.name}
                        </span>
                        {statusBadge(c.status)}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Template: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{c.templateName}</code>
                        {' · '}
                        {new Date(c.createdAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                        <Users className="w-4 h-4" />
                        {c.stats.total}
                      </div>
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        {c.stats.sent}
                      </div>
                      {c.stats.failed > 0 && (
                        <div className="flex items-center gap-1 text-red-500">
                          <XCircle className="w-4 h-4" />
                          {c.stats.failed}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
