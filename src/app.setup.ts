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
    // On Vercel the Swagger UI static files are not bundled with the
    // function, so the UI is loaded from a CDN instead.
    process.env.VERCEL ? SWAGGER_UI_FROM_CDN : {},
  );
}

const SWAGGER_UI_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13';
const SWAGGER_UI_FROM_CDN = {
  customCssUrl: `${SWAGGER_UI_CDN}/swagger-ui.css`,
  customJs: [
    `${SWAGGER_UI_CDN}/swagger-ui-bundle.js`,
    `${SWAGGER_UI_CDN}/swagger-ui-standalone-preset.js`,
  ],
};
