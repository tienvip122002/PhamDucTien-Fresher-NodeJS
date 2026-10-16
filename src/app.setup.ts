import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** Global setup shared by the local server (main.ts) and the Vercel handler. */
export function setupApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // drop fields that are not in the DTO
      forbidNonWhitelisted: true, // ...and reject the request if any are sent
      transform: true, // turn query strings into numbers, apply DTO defaults
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mini Order Management API')
    .setDescription(
      'Products, stock and orders. Orders are confirmed asynchronously by a BullMQ worker.',
    )
    .setVersion('1.0')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
}
