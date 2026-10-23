process.env.TZ ??= 'Asia/Jakarta'; // Laravel config/app.php timezone

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import multer from 'multer';
import { AppModule } from './app.module';
import { PUBLIC_DIR } from './common/helpers/paths';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // Laravel accepted JSON, urlencoded and multipart bodies on every route.
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' });
  app.use(multer({ limits: { fileSize: 10 * 1024 * 1024 } }).none());

  // Laravel served /public/* from the project root (APP_URL/public/images/...).
  app.useStaticAssets(PUBLIC_DIR, { prefix: '/public', maxAge: '7d' });
  app.set('trust proxy', true);
  app.enableShutdownHooks();

  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`approval-jiexpo listening on :${port}`, 'Bootstrap');
}

void bootstrap();
