import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ApiKey } from './api-key.entity';
import { Meeting } from './meeting.entity';
import { Webhook } from './webhook.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  name: string;

  @Column({ default: 'user' })
  role: 'admin' | 'user';

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ApiKey, (apiKey) => apiKey.user)
  apiKeys: ApiKey[];

  @OneToMany(() => Meeting, (meeting) => meeting.user)
  meetings: Meeting[];

  @Column({ default: 5 })
  botAutoExitMinutes: number; // Exit meeting after N minutes if alone (0 = disabled)

  @Column({ default: true })
  botAutoExitEnabled: boolean;

  @OneToMany(() => Webhook, (webhook) => webhook.user)
  webhooks: Webhook[];
}
