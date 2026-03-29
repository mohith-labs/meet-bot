import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Meeting } from './meeting.entity';

@Entity('transcript_segments')
export class TranscriptSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  meetingId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ nullable: true })
  speaker: string;

  @Column({ default: 'en' })
  language: string;

  @Column({ type: 'float', nullable: true })
  startTime: number;

  @Column({ type: 'float', nullable: true })
  endTime: number;

  @Column({ type: 'datetime', nullable: true })
  absoluteStartTime: Date;

  @Column({ type: 'datetime', nullable: true })
  absoluteEndTime: Date;

  @Column({ default: false })
  completed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Meeting, (meeting) => meeting.transcriptSegments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'meetingId' })
  meeting: Meeting;
}
