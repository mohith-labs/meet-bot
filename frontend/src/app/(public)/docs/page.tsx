"use client";

import { useState, useEffect } from "react";
import { CodeBlock } from "@/components/landing/code-block";
import {
  Lock,
  Bot,
  Calendar,
  FileText,
  Key,
  UserPlus,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  request?: string;
  response?: string;
}

interface Section {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  endpoints: Endpoint[];
}

const methodColors: Record<string, string> = {
  GET: "bg-info/10 text-info border-info/20",
  POST: "bg-success/10 text-success border-success/20",
  PUT: "bg-warning/10 text-warning border-warning/20",
  PATCH: "bg-warning/10 text-warning border-warning/20",
  DELETE: "bg-error/10 text-error border-error/20",
};

const sections: Section[] = [
  {
    id: "authentication",
    title: "Authentication",
    icon: <Lock className="w-5 h-5" />,
    description:
      "MeetBot supports two authentication methods: API Key authentication for server-to-server requests, and JWT Bearer tokens for user-scoped requests from the dashboard.",
    endpoints: [
      {
        method: "POST",
        path: "/auth/register",
        description:
          "Create a new user account. Returns a JWT access token and user object.",
        request: `curl -X POST http://localhost:3001/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "john@example.com",
    "password": "securepassword123",
    "name": "John Doe"
  }'`,
        response: `{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-abc-123",
      "email": "john@example.com",
      "name": "John Doe",
      "createdAt": "2024-03-15T10:30:00.000Z",
      "updatedAt": "2024-03-15T10:30:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}`,
      },
      {
        method: "POST",
        path: "/auth/login",
        description:
          "Authenticate with email and password. Returns a JWT access token.",
        request: `curl -X POST http://localhost:3001/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "john@example.com",
    "password": "securepassword123"
  }'`,
        response: `{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-abc-123",
      "email": "john@example.com",
      "name": "John Doe",
      "createdAt": "2024-03-15T10:30:00.000Z",
      "updatedAt": "2024-03-15T10:30:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}`,
      },
    ],
  },
  {
    id: "bots",
    title: "Bots",
    icon: <Bot className="w-5 h-5" />,
    description:
      "Manage transcription bots. Send bots to meetings, check their status, update configuration, and remove them.",
    endpoints: [
      {
        method: "POST",
        path: "/bots",
        description:
          "Create and send a transcription bot to a meeting. The bot will join the specified meeting and begin transcribing.",
        request: `curl -X POST http://localhost:3001/bots \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "platform": "google_meet",
    "nativeMeetingId": "abc-defg-hij",
    "botName": "MyBot",
    "language": "en"
  }'`,
        response: `{
  "success": true,
  "data": {
    "meetingId": "uuid-meeting-123",
    "platform": "google_meet",
    "nativeMeetingId": "abc-defg-hij",
    "constructedMeetingUrl": "https://meet.google.com/abc-defg-hij",
    "status": "requested",
    "botContainerId": null,
    "data": {},
    "createdAt": "2024-03-15T10:30:00.000Z"
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}`,
      },
      {
        method: "GET",
        path: "/bots/status",
        description:
          "Get the current status of all active bots. Returns an array of bot status objects.",
        request: `curl http://localhost:3001/bots/status \\
  -H "X-API-Key: YOUR_API_KEY"`,
        response: `{
  "success": true,
  "data": [
    {
      "meetingId": "uuid-meeting-123",
      "platform": "google_meet",
      "nativeMeetingId": "abc-defg-hij",
      "constructedMeetingUrl": "https://meet.google.com/abc-defg-hij",
      "status": "active",
      "botContainerId": "container-xyz",
      "startTime": "2024-03-15T10:30:05.000Z",
      "data": {},
      "createdAt": "2024-03-15T10:30:00.000Z"
    }
  ],
  "timestamp": "2024-03-15T10:31:00.000Z"
}`,
      },
      {
        method: "DELETE",
        path: "/bots/:platform/:nativeMeetingId",
        description:
          "Remove a bot from a meeting. The bot will leave the meeting and stop transcribing. The transcript is preserved.",
        request: `curl -X DELETE http://localhost:3001/bots/google_meet/abc-defg-hij \\
  -H "X-API-Key: YOUR_API_KEY"`,
        response: `{
  "success": true,
  "data": {
    "meetingId": "uuid-meeting-123",
    "platform": "google_meet",
    "nativeMeetingId": "abc-defg-hij",
    "status": "stopping",
    "endTime": "2024-03-15T11:00:00.000Z",
    "message": "Bot stop requested"
  },
  "timestamp": "2024-03-15T11:00:00.000Z"
}`,
      },
      {
        method: "PUT",
        path: "/bots/:platform/:nativeMeetingId/config",
        description:
          "Update the configuration of an active bot. You can change settings like the transcription language.",
        request: `curl -X PUT http://localhost:3001/bots/google_meet/abc-defg-hij/config \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "language": "es"
  }'`,
        response: `{
  "success": true,
  "data": {
    "meetingId": "uuid-meeting-123",
    "platform": "google_meet",
    "nativeMeetingId": "abc-defg-hij",
    "status": "active",
    "data": { "language": "es" },
    "message": "Bot configuration updated"
  },
  "timestamp": "2024-03-15T10:35:00.000Z"
}`,
      },
    ],
  },
  {
    id: "meetings",
    title: "Meetings",
    icon: <Calendar className="w-5 h-5" />,
    description:
      "View and manage meeting records. Each meeting is automatically created when a bot joins.",
    endpoints: [
      {
        method: "GET",
        path: "/meetings",
        description:
          "List all meetings for the authenticated user.",
        request: `curl http://localhost:3001/meetings \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
        response: `{
  "success": true,
  "data": [
    {
      "id": "uuid-meeting-123",
      "userId": "uuid-user-456",
      "platform": "google_meet",
      "nativeMeetingId": "abc-defg-hij",
      "constructedMeetingUrl": "https://meet.google.com/abc-defg-hij",
      "status": "completed",
      "botContainerId": "container-xyz",
      "startTime": "2024-03-15T10:30:05.000Z",
      "endTime": "2024-03-15T11:00:00.000Z",
      "data": {},
      "createdAt": "2024-03-15T10:30:00.000Z",
      "updatedAt": "2024-03-15T11:00:00.000Z"
    }
  ],
  "timestamp": "2024-03-15T11:05:00.000Z"
}`,
      },
      {
        method: "GET",
        path: "/meetings/:platform/:nativeMeetingId",
        description:
          "Get a single meeting by platform and native meeting ID. Includes transcript segments if available.",
        request: `curl http://localhost:3001/meetings/google_meet/abc-defg-hij \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
        response: `{
  "success": true,
  "data": {
    "id": "uuid-meeting-123",
    "platform": "google_meet",
    "nativeMeetingId": "abc-defg-hij",
    "constructedMeetingUrl": "https://meet.google.com/abc-defg-hij",
    "status": "completed",
    "botContainerId": "container-xyz",
    "startTime": "2024-03-15T10:30:05.000Z",
    "endTime": "2024-03-15T11:00:00.000Z",
    "data": {},
    "transcriptSegments": [],
    "createdAt": "2024-03-15T10:30:00.000Z",
    "updatedAt": "2024-03-15T11:00:00.000Z"
  },
  "timestamp": "2024-03-15T11:05:00.000Z"
}`,
      },
      {
        method: "PATCH",
        path: "/meetings/:platform/:nativeMeetingId",
        description:
          "Update meeting metadata such as name or notes via the data field.",
        request: `curl -X PATCH http://localhost:3001/meetings/google_meet/abc-defg-hij \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -d '{
    "data": {
      "name": "Q4 Planning Meeting",
      "notes": "Discussed roadmap priorities"
    }
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "uuid-meeting-123",
    "platform": "google_meet",
    "nativeMeetingId": "abc-defg-hij",
    "status": "completed",
    "data": {
      "name": "Q4 Planning Meeting",
      "notes": "Discussed roadmap priorities"
    },
    "updatedAt": "2024-03-15T11:10:00.000Z",
    "message": "Meeting updated"
  },
  "timestamp": "2024-03-15T11:10:00.000Z"
}`,
      },
      {
        method: "DELETE",
        path: "/meetings/:platform/:nativeMeetingId",
        description:
          "Delete a meeting record and its associated transcript permanently.",
        request: `curl -X DELETE http://localhost:3001/meetings/google_meet/abc-defg-hij \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
        response: `{
  "success": true,
  "data": {
    "message": "Meeting deleted"
  },
  "timestamp": "2024-03-15T11:15:00.000Z"
}`,
      },
    ],
  },
  {
    id: "transcripts",
    title: "Transcripts",
    icon: <FileText className="w-5 h-5" />,
    description:
      "Retrieve and share meeting transcripts. Transcripts include speaker labels and timestamps.",
    endpoints: [
      {
        method: "GET",
        path: "/transcripts/:platform/:nativeMeetingId",
        description:
          "Get the full transcript for a meeting. Includes speaker labels, timestamps, and a concatenated full text.",
        request: `curl http://localhost:3001/transcripts/google_meet/abc-defg-hij \\
  -H "X-API-Key: YOUR_API_KEY"`,
        response: `{
  "success": true,
  "data": {
    "meeting": {
      "id": "uuid-meeting-123",
      "platform": "google_meet",
      "nativeMeetingId": "abc-defg-hij",
      "constructedMeetingUrl": "https://meet.google.com/abc-defg-hij",
      "status": "completed",
      "startTime": "2024-03-15T10:30:05.000Z",
      "endTime": "2024-03-15T11:00:00.000Z",
      "data": {}
    },
    "segments": [
      {
        "id": "uuid-seg-1",
        "speaker": "John Doe",
        "text": "Let's start with the Q4 roadmap discussion",
        "language": "en",
        "startTime": 0,
        "endTime": 3.2,
        "absoluteStartTime": "2024-03-15T10:30:05.000Z",
        "absoluteEndTime": "2024-03-15T10:30:08.200Z",
        "completed": true,
        "createdAt": "2024-03-15T10:30:08.200Z"
      },
      {
        "id": "uuid-seg-2",
        "speaker": "Sarah Chen",
        "text": "I have the metrics dashboard ready to share",
        "language": "en",
        "startTime": 3.5,
        "endTime": 6.1,
        "absoluteStartTime": "2024-03-15T10:30:08.500Z",
        "absoluteEndTime": "2024-03-15T10:30:11.100Z",
        "completed": true,
        "createdAt": "2024-03-15T10:30:11.100Z"
      }
    ],
    "totalSegments": 2,
    "fullText": "Let's start with the Q4 roadmap discussion\\nI have the metrics dashboard ready to share"
  },
  "timestamp": "2024-03-15T11:05:00.000Z"
}`,
      },
      {
        method: "POST",
        path: "/transcripts/:platform/:nativeMeetingId/share",
        description:
          "Generate a shareable link for a transcript.",
        request: `curl -X POST http://localhost:3001/transcripts/google_meet/abc-defg-hij/share \\
  -H "X-API-Key: YOUR_API_KEY"`,
        response: `{
  "success": true,
  "data": {
    "shareToken": "sh_abc123xyz",
    "shareUrl": "http://localhost:3000/share/sh_abc123xyz",
    "message": "Share link created"
  },
  "timestamp": "2024-03-15T11:05:00.000Z"
}`,
      },
    ],
  },
  {
    id: "api-keys",
    title: "API Keys",
    icon: <Key className="w-5 h-5" />,
    description:
      "Create and manage API keys for authenticating with the MeetBot API.",
    endpoints: [
      {
        method: "POST",
        path: "/api-keys",
        description:
          "Create a new API key. The full key is only returned once upon creation - store it securely.",
        request: `curl -X POST http://localhost:3001/api-keys \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My Key"
  }'`,
        response: `{
  "success": true,
  "data": {
    "id": "uuid-key-123",
    "name": "My Key",
    "key": "mk_live_a1b2c3d4e5f6...",
    "isActive": true,
    "createdAt": "2024-03-15T10:30:00.000Z",
    "message": "API key created. Store it securely — it will not be shown again."
  },
  "timestamp": "2024-03-15T10:30:00.000Z"
}`,
      },
      {
        method: "GET",
        path: "/api-keys",
        description:
          "List all API keys for the authenticated user. Keys are masked for security.",
        request: `curl http://localhost:3001/api-keys \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
        response: `{
  "success": true,
  "data": [
    {
      "id": "uuid-key-123",
      "name": "My Key",
      "keyPrefix": "mk_live_a1b2",
      "isActive": true,
      "lastUsedAt": "2024-03-15T09:00:00.000Z",
      "createdAt": "2024-03-10T10:30:00.000Z"
    }
  ],
  "timestamp": "2024-03-15T10:35:00.000Z"
}`,
      },
      {
        method: "DELETE",
        path: "/api-keys/:id",
        description:
          "Revoke an API key permanently. Any requests using this key will immediately fail.",
        request: `curl -X DELETE http://localhost:3001/api-keys/uuid-key-123 \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
        response: `{
  "success": true,
  "data": {
    "message": "API key revoked"
  },
  "timestamp": "2024-03-15T10:40:00.000Z"
}`,
      },
    ],
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("authentication");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) {
          setActiveSection(visible.target.id);
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
    );

    sections.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16 pt-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            API <span className="gradient-text">Reference</span>
          </h1>
          <p className="text-lg text-text-secondary max-w-xl mx-auto">
            Complete reference for the MeetBot REST API. Authenticate, send
            bots, and retrieve transcripts.
          </p>
        </div>

        {/* Auth info box */}
        <div className="max-w-4xl mx-auto mb-12 p-6 rounded-2xl border border-border bg-bg-secondary/30">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center flex-shrink-0">
              <Lock className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Authentication
              </h3>
              <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                The API supports two authentication methods:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/20 flex-shrink-0 mt-0.5">
                    API Key
                  </span>
                   <div>
                    <p className="text-sm text-text-primary">
                      Pass via{" "}
                      <code className="px-1.5 py-0.5 bg-bg-tertiary rounded text-xs text-brand-secondary font-mono">
                        X-API-Key
                      </code>{" "}
                      header. Recommended for server-to-server requests.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/20 flex-shrink-0 mt-0.5">
                    Bearer
                  </span>
                  <div>
                    <p className="text-sm text-text-primary">
                      Pass JWT token via{" "}
                      <code className="px-1.5 py-0.5 bg-bg-tertiary rounded text-xs text-brand-secondary font-mono">
                        Authorization: Bearer &lt;token&gt;
                      </code>{" "}
                      header. Used for user-scoped dashboard requests.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[220px_1fr] gap-8 max-w-7xl mx-auto">
          {/* Sidebar navigation */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-1">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 px-3">
                Endpoints
              </p>
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all",
                    activeSection === section.id
                      ? "bg-brand-primary/10 text-brand-primary border border-brand-primary/20"
                      : "text-text-secondary hover:text-text-primary hover:bg-white/5 border border-transparent"
                  )}
                >
                  {section.icon}
                  {section.title}
                  {activeSection === section.id && (
                    <ChevronRight className="w-3 h-3 ml-auto" />
                  )}
                </a>
              ))}
            </div>
          </aside>

          {/* Main content */}
          <div className="space-y-16">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
                    <div className="text-brand-primary">{section.icon}</div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-text-primary">
                      {section.title}
                    </h2>
                  </div>
                </div>
                <p className="text-text-secondary mb-8 leading-relaxed">
                  {section.description}
                </p>

                <div className="space-y-8">
                  {section.endpoints.map((endpoint, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-border bg-bg-secondary/20 overflow-hidden"
                    >
                      {/* Endpoint header */}
                      <div className="px-6 py-4 border-b border-border bg-bg-secondary/40">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span
                            className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono border",
                              methodColors[endpoint.method]
                            )}
                          >
                            {endpoint.method}
                          </span>
                          <code className="text-sm font-mono text-text-primary">
                            {endpoint.path}
                          </code>
                        </div>
                        <p className="text-sm text-text-secondary mt-2">
                          {endpoint.description}
                        </p>
                      </div>

                      {/* Request / Response */}
                      <div className="p-6 space-y-4">
                        {endpoint.request && (
                          <div>
                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                              Request
                            </p>
                            <CodeBlock code={endpoint.request} />
                          </div>
                        )}
                        {endpoint.response && (
                          <div>
                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                              Response
                            </p>
                            <CodeBlock code={endpoint.response} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
