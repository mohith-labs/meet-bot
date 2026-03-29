import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('app_settings')
export class AppSettings {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
