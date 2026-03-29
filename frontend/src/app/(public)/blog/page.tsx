"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const posts = [
  {
    slug: "getting-started-with-meetbot-api",
    title: "Getting Started with MeetBot API",
    excerpt:
      "Learn how to set up your first transcription bot in minutes. We walk through authentication, creating a bot, and retrieving your first transcript.",
    date: "2025-03-20",
    readTime: "5 min read",
    category: "Tutorial",
  },
  {
    slug: "real-time-transcription-with-websockets",
    title: "Real-time Transcription with WebSockets",
    excerpt:
      "Dive into our WebSocket API for streaming transcription updates as they happen. Build live dashboards and real-time meeting assistants.",
    date: "2025-03-14",
    readTime: "8 min read",
    category: "Engineering",
  },
  {
    slug: "building-a-meeting-assistant-with-meetbot",
    title: "Building a Meeting Assistant with MeetBot",
    excerpt:
      "A step-by-step guide to building an AI-powered meeting assistant that summarizes discussions, extracts action items, and sends follow-ups automatically.",
    date: "2025-03-08",
    readTime: "10 min read",
    category: "Guide",
  },
  {
    slug: "managing-api-keys-best-practices",
    title: "Managing API Keys Best Practices",
    excerpt:
      "Security best practices for managing your MeetBot API keys. Learn about key rotation, scoped permissions, and keeping your credentials safe.",
    date: "2025-02-28",
    readTime: "4 min read",
    category: "Security",
  },
  {
    slug: "integrating-meetbot-with-your-workflow",
    title: "Integrating MeetBot with Your Workflow",
    excerpt:
      "Connect MeetBot to Slack, Notion, and your CRM using webhooks. Automate meeting notes distribution and keep your team in sync.",
    date: "2025-02-20",
    readTime: "6 min read",
    category: "Integration",
  },
];

const categoryColors: Record<string, string> = {
  Tutorial: "bg-info/10 text-info border-info/20",
  Engineering: "bg-brand-primary/10 text-brand-secondary border-brand-primary/20",
  Guide: "bg-success/10 text-success border-success/20",
  Security: "bg-warning/10 text-warning border-warning/20",
  Integration: "bg-brand-secondary/10 text-brand-secondary border-brand-secondary/20",
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogPage() {
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
          Blog
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-4 text-lg text-text-secondary"
        >
          Latest insights and updates
        </motion.p>
      </div>

      {/* Blog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
        {posts.map((post, index) => (
          <motion.article
            key={post.slug}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 + index * 0.08 }}
          >
            <Link
              href={`/blog/${post.slug}`}
              className="group block h-full"
            >
              <div className="h-full rounded-2xl bg-bg-card/70 backdrop-blur-xl border border-border/60 p-6 flex flex-col transition-all duration-200 hover:border-border-hover hover:shadow-[0_0_30px_rgba(108,92,231,0.08)]">
                {/* Category badge */}
                <div className="mb-4">
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border",
                      categoryColors[post.category] ||
                        "bg-bg-tertiary text-text-secondary border-border"
                    )}
                  >
                    {post.category}
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-lg font-semibold text-text-primary mb-3 group-hover:text-brand-secondary transition-colors leading-snug">
                  {post.title}
                </h2>

                {/* Excerpt */}
                <p className="text-sm text-text-secondary leading-relaxed mb-6 flex-1">
                  {post.excerpt}
                </p>

                {/* Meta footer */}
                <div className="flex items-center justify-between pt-4 border-t border-border/40">
                  <div className="flex items-center gap-4 text-xs text-text-muted">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(post.date)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {post.readTime}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-medium text-brand-primary group-hover:text-brand-secondary transition-colors">
                    Read More
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          </motion.article>
        ))}
      </div>
    </div>
  );
}
