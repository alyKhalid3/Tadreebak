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
      { url: 'https://tadreebak-production.up.railway.app/api/v1', description: 'Production' },
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
            provider: { type: 'string', enum: ['system', 'google', 'facebook'], example: 'system' },
            bio: { type: 'string', example: 'Passionate software developer' },
            headline: { type: 'string', example: 'Software Engineer at Google' },
            skills: { type: 'array', items: { type: 'string' }, example: ['JavaScript', 'Node.js'] },
            education: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  institution: { type: 'string' },
                  degree: { type: 'string' },
                  field: { type: 'string' },
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' }
                }
              }
            },
            experience: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  company: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' }
                }
              }
            },
            dateOfBirth: { type: 'string', format: 'date' },
            gender: { type: 'string', enum: ['male', 'female'] },
            address: { type: 'string' },
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
        Company: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '60d0fe4f5311236168a109ca' },
            name: { type: 'string', example: 'Tech Corp' },
            description: { type: 'string', example: 'A leading tech company' },
            industry: { type: 'string', example: 'Technology' },
            address: { type: 'string', example: '123 Main St' },
            numberOfEmployees: { type: 'string', example: '500' },
            companyEmail: { type: 'string', format: 'email', example: 'info@techcorp.com' },
            createdBy: { type: 'string', example: '60d0fe4f5311236168a109ca' },
            approvedByAdmin: { type: 'boolean', example: false },
            bannedAt: { type: 'string', format: 'date-time', nullable: true },
            deletedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Internship: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '60d0fe4f5311236168a109ca' },
            title: { type: 'string', example: 'Software Engineering Intern' },
            description: { type: 'string', example: 'Join our team to build...' },
            location: { type: 'string', enum: ['on-site', 'remote', 'hybrid'] },
            workingTime: { type: 'string', enum: ['full-time', 'part-time'] },
            softSkills: { type: 'array', items: { type: 'string' }, example: ['teamwork', 'communication'] },
            technicalSkills: { type: 'array', items: { type: 'string' }, example: ['JavaScript', 'Node.js'] },
            companyId: { type: 'string', example: '60d0fe4f5311236168a109ca' },
            addedBy: { type: 'string', example: '60d0fe4f5311236168a109ca' },
            updatedBy: { type: 'string', example: '60d0fe4f5311236168a109ca' },
            closed: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  apis: ['./src/modules/**/*.ts', './src/routes.ts'], // ← fixed
};
export const swaggerSpec = swaggerJsdoc(options);


