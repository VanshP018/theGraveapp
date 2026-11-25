import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://tgi:tgi@localhost:5433/tgi',
  });

  /** Finds the interview row for a room code, creating it if the code was joined directly. */
  async interviewId(room: string): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO interviews (room_code) VALUES ($1)
       ON CONFLICT (room_code) DO UPDATE SET room_code = EXCLUDED.room_code
       RETURNING id`,
      [room],
    );
    return rows[0].id;
  }

  onModuleDestroy() {
    return this.pool.end();
  }
}
