import { NextResponse } from "next/server";

/**
 * GET /api/config
 *
 * Returns runtime configuration that can change per-deployment without
 * rebuilding the Docker image.  Values come from process.env which is
 * read at REQUEST time (not build time).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    apiUrl:
      process.env.RUNTIME_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3001",
  });
}
