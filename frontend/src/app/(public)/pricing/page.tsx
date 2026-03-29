"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Zap,
  Crown,
  Building2,
  ChevronDown,
  Bot,
  Wifi,
  Key,
  Users,
  Webhook,
  Mail,
  Tag,
  Shield,
  Headphones,
  Puzzle,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Get started with the basics. Perfect for testing and personal use.",
    icon: Zap,
    features: [
      { text: "1 concurrent bot", icon: Bot },
      { text: "Unlimited transcription minutes", icon: Wifi },
      { text: "Real-time WebSocket updates", icon: Wifi },
      { text: "REST API access", icon: Key },
      { text: "Community support", icon: Users },
    ],
    cta: "Get Started Free",
    ctaLink: "/register",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/month",
    description: "For teams and power users who need more concurrency.",
    icon: Crown,
    badge: "Recommended",
    features: [
      { text: "10 concurrent bots", icon: Bot },
      { text: "Unlimited transcription minutes", icon: Wifi },
      { text: "Priority transcription", icon: Zap },
      { text: "Webhook support", icon: Webhook },
      { text: "Email support", icon: Mail },
      { text: "Custom bot names", icon: Tag },
    ],
    cta: "Subscribe",
    ctaLink: "/register",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Contact Us",
    period: "",
    description: "Custom solutions for large-scale deployments.",
    icon: Building2,
    features: [
      { text: "Unlimited concurrent bots", icon: Server },
      { text: "Custom deployment", icon: Building2 },
      { text: "SLA guarantees", icon: Shield },
      { text: "Dedicated support", icon: Headphones },
      { text: "Custom integrations", icon: Puzzle },
    ],
    cta: "Contact Sales",
    ctaLink: "mailto:sales@meetbot.dev",
    highlighted: false,
  },
];

const faqs = [
  {
    question: "What limits apply?",
    answer:
      "The only limit is on concurrency — the number of bots you can run at the same time. Transcription minutes are completely unlimited on every plan.",
  },
  {
    question: "Can I change plans?",
    answer:
      "Yes, you can upgrade or downgrade your plan at any time. Changes are prorated instantly, so you only pay for what you use.",
  },
  {
    question: "Which platforms are supported?",
    answer:
      "MeetBot currently supports Google Meet. We are actively working on support for Zoom and Microsoft Teams, coming soon.",
  },
  {
    question: "Is there an API for everything?",
    answer:
      "Yes, all features are available via our REST API. You can manage bots, retrieve transcriptions, configure webhooks, and more — all programmatically.",
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-bg-tertiary/30 transition-colors"
      >
        <span className="text-base font-medium text-text-primary">
          {question}
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-text-muted transition-transform duration-200 flex-shrink-0 ml-4",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <div className="px-5 pb-5 text-sm text-text-secondary leading-relaxed">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="text-center pt-20 pb-16">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl sm:text-5xl font-bold text-text-primary tracking-tight"
        >
          API transcription for{" "}
          <span className="gradient-text">Google Meet</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-4 text-lg text-text-secondary max-w-xl mx-auto"
        >
          Simple concurrency pricing. Unlimited minutes.
        </motion.p>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
        {tiers.map((tier, index) => (
          <motion.div
            key={tier.name}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 + index * 0.1 }}
            className={cn(
              "relative rounded-2xl p-px",
              tier.highlighted
                ? "bg-gradient-to-b from-brand-primary via-brand-primary/40 to-transparent"
                : "bg-transparent"
            )}
          >
            {/* Badge */}
            {tier.badge && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-lg shadow-brand-primary/25">
                  <Crown className="h-3 w-3" />
                  {tier.badge}
                </span>
              </div>
            )}

            <div
              className={cn(
                "relative h-full rounded-2xl p-8 flex flex-col",
                tier.highlighted
                  ? "bg-bg-card/90 backdrop-blur-xl"
                  : "bg-bg-card/70 backdrop-blur-xl border border-border/60"
              )}
            >
              {/* Tier Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      tier.highlighted
                        ? "bg-gradient-to-br from-brand-primary to-brand-secondary"
                        : "bg-bg-tertiary border border-border"
                    )}
                  >
                    <tier.icon
                      className={cn(
                        "h-5 w-5",
                        tier.highlighted
                          ? "text-white"
                          : "text-text-secondary"
                      )}
                    />
                  </div>
                  <h3 className="text-xl font-semibold text-text-primary">
                    {tier.name}
                  </h3>
                </div>

                <div className="flex items-baseline gap-1">
                  <span
                    className={cn(
                      "text-4xl font-bold tracking-tight",
                      tier.highlighted
                        ? "gradient-text"
                        : "text-text-primary"
                    )}
                  >
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-text-muted text-sm">
                      {tier.period}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                  {tier.description}
                </p>
              </div>

              {/* Divider */}
              <div className="h-px bg-border/60 mb-6" />

              {/* Features */}
              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((feature) => (
                  <li
                    key={feature.text}
                    className="flex items-center gap-3"
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0",
                        tier.highlighted
                          ? "bg-brand-primary/15 text-brand-primary"
                          : "bg-bg-tertiary text-text-muted"
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="text-sm text-text-secondary">
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href={tier.ctaLink}
                className={cn(
                  "inline-flex items-center justify-center w-full px-6 py-3 text-sm font-medium rounded-lg transition-all duration-200",
                  tier.highlighted
                    ? "bg-gradient-to-r from-brand-primary to-[#7c6cf7] text-white hover:shadow-[0_0_20px_rgba(108,92,231,0.4)] hover:brightness-110"
                    : "bg-bg-tertiary text-text-primary border border-border hover:bg-[#222240] hover:border-border-hover"
                )}
              >
                {tier.cta}
              </Link>
            </div>
          </motion.div>
        ))}
      </div>

      {/* FAQ Section */}
      <div className="max-w-3xl mx-auto mt-28 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl font-bold text-text-primary">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-text-secondary">
            Everything you need to know about MeetBot pricing.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="space-y-3"
        >
          {faqs.map((faq) => (
            <FAQItem
              key={faq.question}
              question={faq.question}
              answer={faq.answer}
            />
          ))}
        </motion.div>
      </div>
    </div>
  );
}
