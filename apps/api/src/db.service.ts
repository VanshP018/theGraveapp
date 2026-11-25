import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://tgi:tgi@localhost:5433/tgi',
  });

  onModuleDestroy() {
    return this.pool.end();
  }
}
