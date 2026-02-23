import { Injectable, Logger } from '@nestjs/common';
import { MessageButton, MessageListItem } from '../../common/interfaces/common.interface';

/**
 * Channel capability definition
 */
export interface ChannelCapabilities {
  maxButtons: number;       // 0 = no buttons, Infinity = unlimited
  lists: boolean;
  images: boolean;
  location: boolean;
  maxTextLength: number;    // Infinity = unlimited
}

/**
 * Canonical outbound message — platform-agnostic structure
 * that flows through renderForChannel() before hitting a provider.
 */
export interface OutboundMessage {
  text?: string;
  buttons?: MessageButton[];
  listItems?: MessageListItem[];
  listButtonText?: string;
  imageUrl?: string;
  imageCaption?: string;
  location?: { latitude: number; longitude: number; label?: string };
}

/**
 * Rendered message — after adaptation for a specific channel.
 * The provider reads only the fields it needs.
 */
export interface RenderedMessage {
  text?: string;
  buttons?: MessageButton[];
  listItems?: MessageListItem[];
  listButtonText?: string;
  imageUrl?: string;
  imageCaption?: string;
  location?: { latitude: number; longitude: number; label?: string };
}

/**
 * ChannelRendererService
 *
 * Adapts a canonical OutboundMessage to the capabilities of
 * each supported channel before the provider-specific send.
 *
 * Capability matrix:
 *   whatsapp  — buttons=3,  lists=true,  images=true,  location=true,  maxText=4096
 *   telegram  — buttons=10, lists=true,  images=true,  location=true,  maxText=4096
 *   sms       — buttons=0,  lists=false, images=false, location=false, maxText=160
 *   web       — unlimited buttons/lists/images/location/text
 */
@Injectable()
export class ChannelRendererService {
  private readonly logger = new Logger(ChannelRendererService.name);

  private readonly capabilities: Record<string, ChannelCapabilities> = {
    whatsapp: {
      maxButtons: 3,
      lists: true,
      images: true,
      location: true,
      maxTextLength: 4096,
    },
    telegram: {
      maxButtons: 10,
      lists: true,
      images: true,
      location: true,
      maxTextLength: 4096,
    },
    sms: {
      maxButtons: 0,
      lists: false,
      images: false,
      location: false,
      maxTextLength: 160,
    },
    web: {
      maxButtons: Infinity,
      lists: true,
      images: true,
      location: true,
      maxTextLength: Infinity,
    },
    // Mobile app mirrors web capabilities
    app: {
      maxButtons: Infinity,
      lists: true,
      images: true,
      location: true,
      maxTextLength: Infinity,
    },
    // Voice gets text only (for TTS)
    voice: {
      maxButtons: 0,
      lists: false,
      images: false,
      location: false,
      maxTextLength: Infinity,
    },
    // Instagram DM: 3 buttons (postback), images, no lists/location
    instagram: {
      maxButtons: 3,
      lists: false,
      images: true,
      location: false,
      maxTextLength: 1000,
    },
    // RCS is close to WhatsApp
    rcs: {
      maxButtons: 4,
      lists: true,
      images: true,
      location: true,
      maxTextLength: 4096,
    },
  };

  /**
   * Get capabilities for a channel (defaults to web if unknown)
   */
  getCapabilities(channel: string): ChannelCapabilities {
    return this.capabilities[channel] || this.capabilities['web'];
  }

  /**
   * Render a canonical outbound message for a specific channel.
   * Applies truncation, fallback formatting, and capability gating.
   */
  renderForChannel(channel: string, message: OutboundMessage): RenderedMessage {
    const caps = this.getCapabilities(channel);
    const rendered: RenderedMessage = {};

    // --- Text ---
    if (message.text) {
      rendered.text = this.truncateText(message.text, caps.maxTextLength);
    }

    // --- Buttons ---
    if (message.buttons && message.buttons.length > 0) {
      if (caps.maxButtons === 0) {
        // Channel has no button support (SMS, voice) → append as numbered text
        rendered.text = this.buttonsToText(rendered.text || '', message.buttons);
        rendered.text = this.truncateText(rendered.text, caps.maxTextLength);
      } else if (message.buttons.length > caps.maxButtons) {
        // Too many buttons → keep up to max, append overflow hint
        rendered.buttons = message.buttons.slice(0, caps.maxButtons);
        const overflow = message.buttons.length - caps.maxButtons;
        const hint = `\n\nReply with text for ${overflow} more option${overflow > 1 ? 's' : ''}.`;
        rendered.text = (rendered.text || '') + hint;
        rendered.text = this.truncateText(rendered.text, caps.maxTextLength);
      } else {
        rendered.buttons = message.buttons;
      }
    }

    // --- List items ---
    if (message.listItems && message.listItems.length > 0) {
      if (!caps.lists) {
        // No list support → append as numbered text
        rendered.text = this.listToText(rendered.text || '', message.listItems);
        rendered.text = this.truncateText(rendered.text, caps.maxTextLength);
      } else {
        rendered.listItems = message.listItems;
        rendered.listButtonText = message.listButtonText;
      }
    }

    // --- Image ---
    if (message.imageUrl) {
      if (caps.images) {
        rendered.imageUrl = message.imageUrl;
        rendered.imageCaption = message.imageCaption;
      } else {
        // No image support → append URL as text
        const imgText = message.imageCaption
          ? `${message.imageCaption}\n${message.imageUrl}`
          : message.imageUrl;
        rendered.text = rendered.text ? `${rendered.text}\n\n${imgText}` : imgText;
        rendered.text = this.truncateText(rendered.text, caps.maxTextLength);
      }
    }

    // --- Location ---
    if (message.location) {
      if (caps.location) {
        rendered.location = message.location;
      } else {
        // No location support → convert to Google Maps URL
        const mapsUrl = `https://maps.google.com/?q=${message.location.latitude},${message.location.longitude}`;
        const locText = message.location.label
          ? `${message.location.label}\n${mapsUrl}`
          : mapsUrl;
        rendered.text = rendered.text ? `${rendered.text}\n\n${locText}` : locText;
        rendered.text = this.truncateText(rendered.text, caps.maxTextLength);
      }
    }

    return rendered;
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Truncate text at a word boundary, appending "..." if cut.
   */
  private truncateText(text: string, maxLength: number): string {
    if (!isFinite(maxLength) || text.length <= maxLength) {
      return text;
    }

    // Reserve space for "..."
    const limit = maxLength - 3;
    if (limit <= 0) return '...';

    // Find last space before limit
    const lastSpace = text.lastIndexOf(' ', limit);
    const cutPoint = lastSpace > 0 ? lastSpace : limit;
    return text.substring(0, cutPoint) + '...';
  }

  /**
   * Convert buttons to numbered text lines.
   * E.g. "Reply with number:\n1. Order Food\n2. Track Order"
   */
  private buttonsToText(existing: string, buttons: MessageButton[]): string {
    const lines = buttons.map((btn, i) => `${i + 1}. ${btn.title}`);
    const suffix = `\n\nReply with number:\n${lines.join('\n')}`;
    return existing ? existing + suffix : suffix.trim();
  }

  /**
   * Convert list items to numbered text lines.
   */
  private listToText(existing: string, items: MessageListItem[]): string {
    const lines = items.map((item, i) => {
      const desc = item.description ? ` - ${item.description}` : '';
      return `${i + 1}. ${item.title}${desc}`;
    });
    const suffix = `\n\nOptions:\n${lines.join('\n')}\n\nReply with number to select.`;
    return existing ? existing + suffix : suffix.trim();
  }
}
