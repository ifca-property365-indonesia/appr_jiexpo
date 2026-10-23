import { Controller, Get, Header } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

@Controller()
export class SystemController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  root() {
    return 'approval-jiexpo OK';
  }

  /** Laravel ConnectController@index — database connectivity check. */
  @Get('api/connect')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async connect() {
    try {
      await this.db.query('SELECT 1 AS ok');
      return `✅ Berhasil konek ke database: ${this.db.databaseName}`;
    } catch (err) {
      return `❌ Gagal konek ke database. Error: ${(err as Error).message}`;
    }
  }
}
