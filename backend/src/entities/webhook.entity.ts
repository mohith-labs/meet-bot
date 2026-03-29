import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('webhooks')
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.webhooks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  url: string;

  @Column({ nullable: true })
  secret: string;

  @Column({ default: '' })
  name: string;

  @Column('simple-json', { default: '[]' })
  headers: Array<{ key: string; value: string }>;

  @Column('simple-json', { default: '["meeting.started","meeting.ended"]' })
  events: string[]; // e.g., ["meeting.started", "meeting.ended"]

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  lastTriggeredAt: Date;

  @Column({ nullable: true })
  lastStatus: number; // HTTP status code of last webhook call

  @Column({ nullable: true })
  lastError: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
