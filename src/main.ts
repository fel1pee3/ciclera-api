import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureApplication } from './application';
import { AppModule } from './app.module';
import { readEnvironment } from './config/environment';
import { StructuredLoggerService } from './observability/structured-logger.service';

async function bootstrap() {
  const bootstrapLogger = new StructuredLoggerService();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: bootstrapLogger,
  });
  const environment = readEnvironment(app.get(ConfigService));

  configureApplication(app, environment);
  await app.listen(environment.PORT, '0.0.0.0');

  app.get(StructuredLoggerService).log('application.started', {
    environment: environment.NODE_ENV,
    port: environment.PORT,
  });
}

void bootstrap().catch((error: unknown) => {
  new StructuredLoggerService().fatal('application.bootstrap.failed', error);
  process.exitCode = 1;
});
