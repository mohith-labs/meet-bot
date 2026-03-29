"use client";

import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { CodeBlock } from "@/components/landing/code-block";
import { FeatureCard } from "@/components/landing/feature-card";
import { StepCard } from "@/components/landing/step-card";
import {
  Zap,
  Code2,
  Key,
  LayoutDashboard,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

const createBotCode = `curl -X POST http://localhost:3001/bots \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "platform": "google_meet",
    "nativeMeetingId": "abc-defg-hij"
  }'`;

const getTranscriptCode = `curl http://localhost:3001/transcripts/google_meet/abc-defg-hij \\
  -H "X-API-Key: YOUR_API_KEY"

# Response:
# {
#   "success": true,
#   "data": {
#     "meeting": { "id": "...", "platform": "google_meet", "nativeMeetingId": "abc-defg-hij" },
#     "segments": [
#       { "speaker": "John", "text": "Let's discuss the roadmap", "startTime": 0 },
#       { "speaker": "Sarah", "text": "I have the Q4 metrics ready", "startTime": 30 }
#     ],
#     "totalSegments": 2,
#     "fullText": "..."
#   },
#   "timestamp": "2024-03-15T10:30:00.000Z"
# }`;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-32">
        {/* Animated gradient orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] pointer-events-none">
          <div className="absolute top-20 left-1/4 w-72 h-72 rounded-full bg-brand-primary/15 blur-[120px] animate-pulse" />
          <div className="absolute top-40 right-1/4 w-96 h-96 rounded-full bg-[#4c3cb7]/10 blur-[150px] animate-pulse [animation-delay:1s]" />
          <div className="absolute top-10 right-1/3 w-64 h-64 rounded-full bg-brand-secondary/10 blur-[100px] animate-pulse [animation-delay:2s]" />
        </div>

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(108,92,231,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(108,92,231,0.3) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Platform badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-bg-secondary/80 border border-border mb-8 backdrop-blur-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
              <path
                d="M12.5 2C6.98 2 2.5 6.48 2.5 12C2.5 17.52 6.98 22 12.5 22C18.02 22 22.5 17.52 22.5 12C22.5 6.48 18.02 2 12.5 2Z"
                fill="#00832d"
              />
              <path
                d="M9.5 8.5V15.5L15.5 12L9.5 8.5Z"
                fill="white"
              />
            </svg>
            <span className="text-xs font-medium text-text-secondary">
              Google Meet Integration
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6">
            <span className="block text-text-primary">Meeting</span>
            <span className="block gradient-text">Transcription API</span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg sm:text-xl text-text-secondary leading-relaxed mb-10">
            Real-time meeting transcription for Google Meet. Join meetings via
            API, get live transcripts, and build meeting-powered applications.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/get-started"
              className="group inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-gradient-to-r from-brand-primary to-[#7c6cf7] rounded-xl hover:shadow-[0_0_30px_rgba(108,92,231,0.4)] transition-all duration-300"
            >
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-medium text-text-secondary bg-bg-secondary/60 border border-border rounded-xl hover:border-border-hover hover:text-text-primary hover:bg-bg-secondary transition-all duration-300"
            >
              View API Docs
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Simple API Section */}
      <section className="relative py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              <code className="text-brand-primary font-mono">POST</code> bot{" "}
              <span className="text-text-muted mx-2">→</span>{" "}
              <code className="text-brand-primary font-mono">GET</code>{" "}
              transcripts.{" "}
              <span className="text-text-secondary">That&apos;s it.</span>
            </h2>
            <p className="text-text-secondary text-lg max-w-xl mx-auto">
              Two API calls is all it takes to start transcribing your meetings.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-6xl mx-auto">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-success/10 text-success text-xs font-bold font-mono">
                  POST
                </span>
                <span className="text-sm text-text-secondary">
                  1. Send a bot to your meeting
                </span>
              </div>
              <CodeBlock code={createBotCode} title="Create Bot" />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-info/10 text-info text-xs font-bold font-mono">
                  GET
                </span>
                <span className="text-sm text-text-secondary">
                  2. Retrieve the transcript
                </span>
              </div>
              <CodeBlock code={getTranscriptCode} title="Get Transcript" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-20 lg:py-32">
        {/* Subtle background accent */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-primary/[0.02] to-transparent" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              Everything you need to{" "}
              <span className="gradient-text">transcribe meetings</span>
            </h2>
            <p className="text-text-secondary text-lg max-w-xl mx-auto">
              A complete API for meeting transcription, built for developers.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <FeatureCard
              icon={<Zap className="w-6 h-6" />}
              title="Real-time Transcription"
              description="Sub-second latency for live transcripts via WebSocket. Get speaker-labeled text as the conversation happens."
            />
            <FeatureCard
              icon={<Code2 className="w-6 h-6" />}
              title="Simple REST API"
              description="POST bot, GET transcript. Two calls to start transcribing any Google Meet. Clean, predictable JSON responses."
            />
            <FeatureCard
              icon={<Key className="w-6 h-6" />}
              title="API Key Management"
              description="Create and manage API keys from the dashboard. Scope permissions and rotate keys without downtime."
            />
            <FeatureCard
              icon={<LayoutDashboard className="w-6 h-6" />}
              title="Meeting Dashboard"
              description="View meetings, transcripts, and manage bots from one place. Full visibility into your transcription pipeline."
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative py-20 lg:py-32">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              Up and running in{" "}
              <span className="gradient-text">3 steps</span>
            </h2>
          </div>

          <div className="space-y-10">
            <StepCard
              number={1}
              title="Get your API key"
              description="Sign up and create an API key from the dashboard. It takes less than a minute."
            />

            <div className="ml-6 border-l-2 border-border h-6" />

            <StepCard
              number={2}
              title="Send a bot to your Google Meet"
              description="Make a simple POST request with your meeting URL. The bot joins automatically and starts listening."
            />

            <div className="ml-6 border-l-2 border-border h-6" />

            <StepCard
              number={3}
              title="Retrieve real-time transcripts"
              description="GET the transcript via REST API or subscribe to live updates via WebSocket. Speaker labels included."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 lg:py-32">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-bg-secondary to-brand-secondary/10" />
            <div className="absolute inset-0 bg-bg-primary/60 backdrop-blur-sm" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-brand-primary/20 blur-[80px]" />

            <div className="relative border border-border rounded-3xl px-8 py-16 sm:px-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                Start transcribing your meetings today
              </h2>
              <p className="text-text-secondary text-lg mb-8 max-w-lg mx-auto">
                Get your API key and start sending bots to your meetings in
                minutes. Free to get started.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/get-started"
                  className="group inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-gradient-to-r from-brand-primary to-[#7c6cf7] rounded-xl hover:shadow-[0_0_30px_rgba(108,92,231,0.4)] transition-all duration-300"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="/docs"
                  className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium inline-flex items-center gap-1.5"
                >
                  View API Docs
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-text-primary">
                Meet<span className="text-brand-primary">Bot</span>
              </span>
            </div>

            <div className="flex items-center gap-6">
              <Link
                href="/docs"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                API Docs
              </Link>
              <Link
                href="/get-started"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Get Started
              </Link>
              <a
                href="https://github.com/your-org/meetbot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                GitHub
              </a>
            </div>

            <p className="text-xs text-text-muted">
              &copy; {new Date().getFullYear()} MeetBot. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
