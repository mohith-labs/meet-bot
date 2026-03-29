import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeetBot - Meeting Transcription Dashboard",
  description:
    "AI-powered meeting transcription bot. Record, transcribe, and manage your meetings in real-time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Inject the API URL into window.__RUNTIME_CONFIG__ so client-side code
  // can read it at runtime (instead of relying on build-time NEXT_PUBLIC_*).
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const runtimeConfigScript = `window.__RUNTIME_CONFIG__=${JSON.stringify({ apiUrl })};`;

  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: runtimeConfigScript }} />
      </head>
      <body className="bg-bg-primary text-text-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
