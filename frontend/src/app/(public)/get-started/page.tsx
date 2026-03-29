"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { CodeBlock } from "@/components/landing/code-block";
import {
  Key,
  Video,
  Send,
  FileText,
  Trash2,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  {
    number: 1,
    title: "Get Your API Key",
    icon: Key,
    description:
      "Sign up for an account and create an API key from the dashboard.",
  },
  {
    number: 2,
    title: "Start a Google Meet",
    icon: Video,
    description:
      "Create or join a Google Meet session that you want to transcribe.",
  },
  {
    number: 3,
    title: "Send a Bot",
    icon: Send,
    description:
      "Use the API to send a transcription bot to your meeting.",
  },
  {
    number: 4,
    title: "Get Transcription",
    icon: FileText,
    description:
      "Retrieve the real-time transcript via REST API or WebSocket.",
  },
  {
    number: 5,
    title: "Stop the Bot",
    icon: Trash2,
    description: "Remove the bot from the meeting when you're done.",
  },
];

export default function GetStartedPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");

  const displayApiKey = apiKey || "YOUR_API_KEY";

  // Extract native meeting ID from URL (e.g. "abc-defg-hij" from "https://meet.google.com/abc-defg-hij")
  const meetingId = useMemo(() => {
    try {
      const match = meetingUrl.match(/meet\.google\.com\/([a-z]+-[a-z]+-[a-z]+)/);
      return match ? match[1] : "MEETING_ID";
    } catch {
      return "MEETING_ID";
    }
  }, [meetingUrl]);

  const stepContent = [
    // Step 1: Get API Key
    {
      content: (
        <div className="space-y-6">
          <p className="text-text-secondary leading-relaxed">
            First, you need an API key. Sign up for a MeetBot account, then
            navigate to the API Keys section in your dashboard to create one.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-brand-primary to-[#7c6cf7] rounded-xl hover:shadow-[0_0_20px_rgba(108,92,231,0.4)] transition-all"
            >
              Create Account
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard/api-keys"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-text-secondary border border-border rounded-xl hover:border-border-hover hover:text-text-primary transition-all"
            >
              Go to API Keys
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-text-secondary font-medium">
              Paste your API key here (used in examples below):
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="mk_live_..."
              className="w-full px-4 py-3 bg-bg-secondary border border-border rounded-xl text-text-primary text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary/20 transition-all"
            />
          </div>
        </div>
      ),
    },
    // Step 2: Start a Google Meet
    {
      content: (
        <div className="space-y-6">
          <p className="text-text-secondary leading-relaxed">
            Start or join a Google Meet session. You can create a new meeting
            instantly or use an existing meeting link.
          </p>
          <a
            href="https://meet.new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[#00832d] rounded-xl hover:bg-[#006d25] transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
              <path d="M9.5 8.5V15.5L15.5 12L9.5 8.5Z" fill="white" />
            </svg>
            Start a New Google Meet
            <ExternalLink className="w-4 h-4" />
          </a>
          <div className="space-y-2">
            <label className="text-sm text-text-secondary font-medium">
              Paste your meeting URL here (used in examples below):
            </label>
            <input
              type="text"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="w-full px-4 py-3 bg-bg-secondary border border-border rounded-xl text-text-primary text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary/20 transition-all"
            />
          </div>
        </div>
      ),
    },
    // Step 3: Send a Bot
    {
      content: (
        <div className="space-y-6">
          <p className="text-text-secondary leading-relaxed">
            Send a transcription bot to your meeting with a single API call. The
            bot will join the meeting and start transcribing automatically.
          </p>
          <CodeBlock
            title="Send Bot to Meeting"
            code={`curl -X POST http://localhost:3001/bots \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${displayApiKey}" \\
  -d '{
    "platform": "google_meet",
    "nativeMeetingId": "${meetingId}"
  }'`}
          />
          <div className="p-4 rounded-xl bg-success/5 border border-success/20">
            <p className="text-sm text-success">
              <strong>Response:</strong> You&apos;ll receive a bot ID and status.
              The bot typically joins within 5-10 seconds.
            </p>
          </div>
        </div>
      ),
    },
    // Step 4: Get Transcription
    {
      content: (
        <div className="space-y-6">
          <p className="text-text-secondary leading-relaxed">
            Once the bot is in the meeting, you can retrieve the transcript at
            any time. The transcript updates in real-time.
          </p>
          <CodeBlock
            title="Get Transcript"
            code={`curl http://localhost:3001/transcripts/google_meet/${meetingId} \\
  -H "X-API-Key: ${displayApiKey}"`}
          />
          <CodeBlock
            title="Response"
            code={`{
  "success": true,
  "data": {
    "meeting": {
      "id": "...",
      "platform": "google_meet",
      "nativeMeetingId": "${meetingId}",
      "status": "completed"
    },
    "segments": [
      {
        "speaker": "John",
        "text": "Let's discuss the Q4 roadmap",
        "startTime": 0,
        "endTime": 3.2
      },
      {
        "speaker": "Sarah",
        "text": "I have the metrics ready to share",
        "startTime": 3.5,
        "endTime": 6.1
      }
    ],
    "totalSegments": 2,
    "fullText": "Let's discuss the Q4 roadmap\\nI have the metrics ready to share"
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}`}
          />
        </div>
      ),
    },
    // Step 5: Stop the Bot
    {
      content: (
        <div className="space-y-6">
          <p className="text-text-secondary leading-relaxed">
            When you&apos;re done transcribing, remove the bot from the meeting.
            The transcript will remain available via the API.
          </p>
          <CodeBlock
            title="Stop Bot"
            code={`curl -X DELETE http://localhost:3001/bots/google_meet/${meetingId} \\
  -H "X-API-Key: ${displayApiKey}"`}
          />
          <div className="p-4 rounded-xl bg-info/5 border border-info/20">
            <p className="text-sm text-info">
              <strong>Note:</strong> The transcript is saved permanently and can
              be retrieved at any time after the bot leaves.
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            Get Started with{" "}
            <span className="gradient-text">MeetBot</span>
          </h1>
          <p className="text-lg text-text-secondary max-w-xl mx-auto">
            Follow these steps to start transcribing your Google Meet
            sessions in minutes.
          </p>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-8">
          {/* Step navigation */}
          <div className="space-y-2">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === activeStep;
              const isCompleted = idx < activeStep;

              return (
                <button
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200",
                    isActive
                      ? "bg-brand-primary/10 border border-brand-primary/30 text-text-primary"
                      : "hover:bg-white/5 text-text-secondary hover:text-text-primary border border-transparent"
                  )}
                >
                  <div
                    className={cn(
                      "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                      isActive
                        ? "bg-brand-primary text-white"
                        : isCompleted
                        ? "bg-success/20 text-success"
                        : "bg-bg-tertiary text-text-muted"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{step.title}</div>
                    <div className="text-xs text-text-muted hidden lg:block">
                      Step {step.number}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Step content */}
          <div className="rounded-2xl border border-border bg-bg-secondary/30 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
                {(() => {
                  const Icon = steps[activeStep].icon;
                  return <Icon className="w-5 h-5 text-brand-primary" />;
                })()}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-text-primary">
                  {steps[activeStep].title}
                </h2>
                <p className="text-sm text-text-muted">
                  Step {steps[activeStep].number} of {steps.length}
                </p>
              </div>
            </div>

            {stepContent[activeStep].content}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <button
                onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
                disabled={activeStep === 0}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                  activeStep === 0
                    ? "text-text-muted cursor-not-allowed"
                    : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                )}
              >
                Previous
              </button>
              <div className="flex items-center gap-1.5">
                {steps.map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      idx === activeStep
                        ? "bg-brand-primary w-6"
                        : idx < activeStep
                        ? "bg-success"
                        : "bg-border"
                    )}
                  />
                ))}
              </div>
              <button
                onClick={() =>
                  setActiveStep(
                    Math.min(steps.length - 1, activeStep + 1)
                  )
                }
                disabled={activeStep === steps.length - 1}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                  activeStep === steps.length - 1
                    ? "text-text-muted cursor-not-allowed"
                    : "text-brand-primary hover:bg-brand-primary/10"
                )}
              >
                Next Step
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
