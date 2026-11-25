import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CollabService } from './collab/collab.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  app.get(CollabService).attach(app.getHttpServer());
  console.log(`API listening on http://localhost:${port}`);
}

void bootstrap();
