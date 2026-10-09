import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { Meeting } from './meeting.entity';

export enum UploadStatus {
  PENDING = 'pending',
  UPLOADING = 'uploading',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export interface UploadedArtifact {
  /** Logical artifact name: video | audio | transcript.json | transcript.txt | transcript.vtt | metadata.json */
  name: string;
  key: string;
  size: number;
  contentType: string;
}

/**
 * Tracks the S3 archival of a single meeting's artifacts.
 */
@Entity('meeting_uploads')
export class MeetingUpload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  meetingId: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meetingId' })
  meeting: Meeting;

  @Column()
  userId: string;

  @Column({ type: 'varchar', default: UploadStatus.PENDING })
  status: UploadStatus;

  /** Bucket the artifacts were written to. */
  @Column({ default: '' })
  bucket: string;

  /** Folder key prefix, e.g. "meetings/2026-10-09/14-30-00_sprint-planning_a1b2c3d4". */
  @Column({ default: '' })
  folderKey: string;

  @Column({ type: 'simple-json', nullable: true })
  artifacts: UploadedArtifact[];

  @Column({ type: 'integer', default: 0 })
  totalBytes: number;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  lastError: string;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date;

  /** True once local recordings were removed after a successful upload. */
  @Column({ default: false })
  localFilesDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
