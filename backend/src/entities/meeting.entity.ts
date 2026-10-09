import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { TranscriptSegment } from './transcript-segment.entity';

export enum MeetingPlatform {
  GOOGLE_MEET = 'google_meet',
}

export enum MeetingStatus {
  REQUESTED = 'requested',
  JOINING = 'joining',
  AWAITING_ADMISSION = 'awaiting_admission',
  ACTIVE = 'active',
  STOPPING = 'stopping',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('meetings')
export class Meeting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({
    type: 'varchar',
    default: MeetingPlatform.GOOGLE_MEET,
  })
  platform: MeetingPlatform;

  @Column()
  nativeMeetingId: string;

  @Column({ nullable: true })
  constructedMeetingUrl: string;

  /**
   * Human-readable meeting title scraped from the Google Meet page
   * (falls back to null when it could not be detected).
   * Used to build readable S3 folder names.
   */
  @Column({ nullable: true })
  title: string;

  @Column({
    type: 'varchar',
    default: MeetingStatus.REQUESTED,
  })
  status: MeetingStatus;

  @Column({ nullable: true })
  botContainerId: string;

  @Column({ type: 'datetime', nullable: true })
  startTime: Date;

  @Column({ type: 'datetime', nullable: true })
  endTime: Date;

  @Column({ type: 'simple-json', nullable: true })
  data: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.meetings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => TranscriptSegment, (segment) => segment.meeting)
  transcriptSegments: TranscriptSegment[];
}
