import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Meeting, MeetingPlatform } from '../entities/meeting.entity';
import { UpdateMeetingDto } from './dto/update-meeting.dto';

@Injectable()
export class MeetingsService {
  constructor(
    @InjectRepository(Meeting)
    private readonly meetingsRepository: Repository<Meeting>,
  ) {}

  async listByUser(userId: string): Promise<Meeting[]> {
    return this.meetingsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async listByUserPaginated(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
    search?: string,
  ): Promise<{
    meetings: Meeting[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const qb = this.meetingsRepository
      .createQueryBuilder('meeting')
      .where('meeting.userId = :userId', { userId })
      .orderBy('meeting.createdAt', 'DESC');

    if (status) {
      qb.andWhere('meeting.status = :status', { status });
    }

    if (search) {
      qb.andWhere(
        '(meeting.nativeMeetingId LIKE :search OR meeting.data LIKE :search)',
        { search: `%${search}%` },
      );
    }

    const total = await qb.getCount();
    const meetings = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      meetings,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByPlatformAndId(
    userId: string,
    platform: MeetingPlatform,
    nativeMeetingId: string,
  ): Promise<Meeting> {
    const meeting = await this.meetingsRepository.findOne({
      where: { userId, platform, nativeMeetingId },
      relations: ['transcriptSegments'],
      order: { createdAt: 'DESC' },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    return meeting;
  }

  async updateMeeting(
    userId: string,
    platform: MeetingPlatform,
    nativeMeetingId: string,
    updateDto: UpdateMeetingDto,
  ): Promise<Meeting> {
    const meeting = await this.meetingsRepository.findOne({
      where: { userId, platform, nativeMeetingId },
      order: { createdAt: 'DESC' },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (updateDto.data) {
      meeting.data = {
        ...(meeting.data || {}),
        ...updateDto.data,
      };
    }

    return this.meetingsRepository.save(meeting);
  }

  async deleteMeeting(
    userId: string,
    platform: MeetingPlatform,
    nativeMeetingId: string,
  ): Promise<void> {
    const meeting = await this.meetingsRepository.findOne({
      where: { userId, platform, nativeMeetingId },
      order: { createdAt: 'DESC' },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Anonymize the meeting data before soft-deleting
    meeting.data = { anonymized: true, anonymizedAt: new Date().toISOString() };
    await this.meetingsRepository.save(meeting);

    // Remove the meeting record entirely
    await this.meetingsRepository.remove(meeting);
  }

  async findByIdForUser(userId: string, meetingId: string): Promise<Meeting> {
    const meeting = await this.meetingsRepository.findOne({
      where: { id: meetingId, userId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    return meeting;
  }

  async findById(meetingId: string): Promise<Meeting | null> {
    return this.meetingsRepository.findOne({
      where: { id: meetingId },
    });
  }
}
