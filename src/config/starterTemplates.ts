// App-level starter templates for the "Start from template" gallery
// (/shopify/templates/new). These are static, not per-shop DB rows — same
// "single source of truth in config" pattern the removed memberships feature
// used. Loaded into TemplateEditor as a pre-filled, still-editable starting
// point; nothing is persisted until the merchant hits Save.
import { docFromText } from "@/lib/tiptapContent";
import type { BlockType } from "@/components/TemplateEditor";

export type StarterTemplateBlock = { type: BlockType; data: Record<string, any> };

export type StarterTemplate = {
  id: string;
  name: string;
  thumbnail_description: string;
  subject: string;
  blocks: StarterTemplateBlock[];
};

export const starterTemplates: StarterTemplate[] = [
  {
    id: "welcome",
    name: "Welcome Email",
    thumbnail_description: "Warm greeting + intro offer for new subscribers",
    subject: "Welcome to {{shop_name}}, {{first_name}}!",
    blocks: [
      { type: "header", data: { text: "Welcome to {{shop_name}}!", fontSize: 28 } },
      {
        type: "text",
        data: {
          content: docFromText(
            "Hi {{first_name}},\n\nThanks for joining {{shop_name}} — we're thrilled to have you. As a welcome gift, enjoy 10% off your first order."
          ),
        },
      },
      { type: "button", data: { label: "Shop Now", url: "", color: "#16a34a" } },
      { type: "divider", data: {} },
      { type: "footer", data: { text: "You're receiving this because you subscribed to {{shop_name}}. Unsubscribe" } },
    ],
  },
  {
    id: "order-followup",
    name: "Order Follow-up",
    thumbnail_description: "Thank-you note + review request after purchase",
    subject: "How's your order, {{first_name}}?",
    blocks: [
      { type: "header", data: { text: "Thanks for your order!", fontSize: 26 } },
      {
        type: "text",
        data: {
          content: docFromText(
            "Hi {{first_name}},\n\nWe hope you're loving what you picked up from {{shop_name}}. If you have a minute, we'd love to hear what you think."
          ),
        },
      },
      { type: "button", data: { label: "Leave a Review", url: "", color: "#2563eb" } },
      { type: "divider", data: {} },
      { type: "footer", data: { text: "You're receiving this because you subscribed to {{shop_name}}. Unsubscribe" } },
    ],
  },
  {
    id: "abandoned-cart",
    name: "Abandoned Cart",
    thumbnail_description: "Reminder nudge for items left in cart",
    subject: "{{first_name}}, you left something behind",
    blocks: [
      { type: "header", data: { text: "Still thinking it over?", fontSize: 26 } },
      {
        type: "text",
        data: {
          content: docFromText(
            "Hi {{first_name}},\n\nYou left a few items in your cart at {{shop_name}}. They're still available, but they won't wait forever."
          ),
        },
      },
      { type: "button", data: { label: "Complete Your Order", url: "", color: "#dc2626" } },
      { type: "divider", data: {} },
      { type: "footer", data: { text: "You're receiving this because you subscribed to {{shop_name}}. Unsubscribe" } },
    ],
  },
  {
    id: "sale-announcement",
    name: "Sale Announcement",
    thumbnail_description: "Bold banner-style promo for a time-limited sale",
    subject: "🔥 Sale starts now at {{shop_name}}",
    blocks: [
      { type: "header", data: { text: "Big Sale, {{first_name}} — Don't Miss Out", fontSize: 30 } },
      {
        type: "text",
        data: {
          content: docFromText(
            "For a limited time, everything at {{shop_name}} is on sale. Stock up before it's gone."
          ),
        },
      },
      { type: "button", data: { label: "Shop the Sale", url: "", color: "#dc2626" } },
      { type: "divider", data: {} },
      { type: "footer", data: { text: "You're receiving this because you subscribed to {{shop_name}}. Unsubscribe" } },
    ],
  },
  {
    id: "product-launch",
    name: "Product Launch",
    thumbnail_description: "Feature image + hero copy for a new product drop",
    subject: "Just dropped: something new from {{shop_name}}",
    blocks: [
      { type: "header", data: { text: "Introducing Our Newest Arrival", fontSize: 28 } },
      { type: "image", data: { url: "", alt: "New product" } },
      {
        type: "text",
        data: {
          content: docFromText(
            "Hi {{first_name}},\n\nWe've been working on something new at {{shop_name}}, and it's finally here. Get an early look before everyone else."
          ),
        },
      },
      { type: "button", data: { label: "See What's New", url: "", color: "#16a34a" } },
      { type: "divider", data: {} },
      { type: "footer", data: { text: "You're receiving this because you subscribed to {{shop_name}}. Unsubscribe" } },
    ],
  },
  {
    id: "newsletter",
    name: "Newsletter",
    thumbnail_description: "Simple roundup layout for regular updates",
    subject: "{{shop_name}} — what's new this month",
    blocks: [
      { type: "header", data: { text: "The {{shop_name}} Roundup", fontSize: 26 } },
      {
        type: "text",
        data: {
          content: docFromText(
            "Hi {{first_name}},\n\nHere's what's been happening at {{shop_name}} lately — new arrivals, updates, and a few things we think you'll like."
          ),
        },
      },
      { type: "divider", data: {} },
      {
        type: "text",
        data: { content: docFromText("Have feedback or a question? Just reply to this email — we read every one.") },
      },
      { type: "footer", data: { text: "You're receiving this because you subscribed to {{shop_name}}. Unsubscribe" } },
    ],
  },
];
