import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolve the STORAGE_PATH from the environment.
 * Defaults to `.data/recordings` relative to cwd.
 */
export function resolveStoragePath(configService: ConfigService): string {
  const configured = configService.get<string>('STORAGE_PATH');
  const storagePath = configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), '.data', 'recordings');
  return storagePath;
}

/**
 * Get the recording directory for a specific meeting, creating it if needed.
 */
export function getRecordingDir(storagePath: string, meetingId: string): string {
  const dir = path.join(storagePath, meetingId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
