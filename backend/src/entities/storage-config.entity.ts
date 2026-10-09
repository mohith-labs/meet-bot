import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Per-user S3-compatible storage configuration.
 *
 * One row per user (AWS S3, Cloudflare R2, MinIO, Backblaze B2, Wasabi, ...).
 * The secret access key is stored encrypted at rest — see `storage/crypto.util.ts`.
 */
@Entity('storage_configs')
export class StorageConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Master switch — when false nothing is uploaded for this user. */
  @Column({ default: false })
  isEnabled: boolean;

  /** Custom endpoint for S3-compatible providers. Empty => real AWS S3. */
  @Column({ default: '' })
  endpoint: string;

  @Column({ default: 'us-east-1' })
  region: string;

  @Column({ default: '' })
  bucket: string;

  @Column({ default: '' })
  accessKeyId: string;

  /** AES-256-GCM encrypted. Never returned by the API. */
  @Column({ type: 'text', default: '' })
  secretAccessKeyEncrypted: string;

  /** Required by MinIO and most non-AWS providers. */
  @Column({ default: true })
  forcePathStyle: boolean;

  /** Key prefix inside the bucket, e.g. "meetings". */
  @Column({ default: 'meetings' })
  prefix: string;

  /** IANA timezone used to build the date/time folder names, e.g. "Asia/Kolkata". */
  @Column({ default: 'UTC' })
  timezone: string;

  /** Delete local recordings once the upload succeeds (S3 becomes source of truth). */
  @Column({ default: true })
  deleteLocalAfterUpload: boolean;

  /** Also archive meetings that ended in FAILED state (partial data). */
  @Column({ default: true })
  uploadOnFailed: boolean;

  /** Public base URL for browsing objects, e.g. a CDN in front of the bucket. */
  @Column({ default: '' })
  publicBaseUrl: string;

  @Column({ type: 'datetime', nullable: true })
  lastTestedAt: Date;

  @Column({ nullable: true })
  lastTestError: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
