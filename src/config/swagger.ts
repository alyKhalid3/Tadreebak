import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Tadreebak API',
      version: '1.0.0',
      description: 'API documentation for Tadreebak',
    },
    servers: [
      { url: 'http://localhost:3000/api/v1', description: 'Local' },
      { url: 'https://tadreebak.railway.app/api/v1', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '60d0fe4f5311236168a109ca' },
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            phoneNumber: { type: 'string', example: '+1234567890' },
            isConfirmed: { type: 'boolean', example: false },
            provider: { type: 'string', example: 'system' },
          },
        },
        Tokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            statusCode: { type: 'integer', example: 400 },
            message: { type: 'string', example: 'Error message' },
          },
        },
      },
    },
  },
  apis: ['./src/modules/**/*.ts', './src/routes.ts'], // ← fixed
};
export const swaggerSpec = swaggerJsdoc(options);