import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..', '..');

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
      { url: 'https://tadreebak-e285.onbelmo.uk/api/v1/', description: 'Production' },
    ],
    // Top-level tags array (OpenAPI 3.0 spec). Without this, swagger-ui
    // lists every route under "default" — not very useful.
    tags: [
      { name: 'System', description: 'Health, liveness, and operational endpoints' },
      { name: 'Auth', description: 'Signup, login, password reset, OTP' },
      { name: 'User', description: 'Profile management and media uploads' },
      { name: 'Company', description: 'Company profile, admin actions' },
      { name: 'Internships', description: 'Internship postings' },
      { name: 'Applications', description: 'Student applications to internships' },
      { name: 'Billing', description: 'Plans, credits, Paymob payment flow' },
      { name: 'Notifications', description: 'In-app notification feed' },
      { name: 'Ratings', description: 'Mutual ratings after internship completion' },
      { name: 'Files', description: 'Authenticated file proxy (Cloudinary)' },
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
            role: { type: 'string', enum: ['admin', 'user', 'student', 'company_owner'], example: 'student' },
            isConfirmed: { type: 'boolean', example: false },
            provider: { type: 'string', enum: ['system', 'google', 'facebook'], example: 'system' },
            bio: { type: 'string', example: 'Passionate software developer' },
            headline: { type: 'string', example: 'Software Engineer at Google' },
            skills: { type: 'array', items: { type: 'string' }, example: ['JavaScript', 'Node.js'] },
            categories: { type: 'array', items: { type: 'string' }, example: ['backend', 'fullstack'] },
            courses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  certificate: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      public_id: { type: 'string' },
                      secure_url: { type: 'string' },
                      resourceType: { type: 'string', enum: ['image', 'raw'] },
                    },
                  },
                },
              },
            },
            profilePicture: {
              type: 'object',
              properties: {
                public_id: { type: 'string' },
                secure_url: { type: 'string' },
              },
            },
            coverPicture: {
              type: 'object',
              properties: {
                public_id: { type: 'string' },
                secure_url: { type: 'string' },
              },
            },
            resume: {
              type: 'object',
              properties: {
                public_id: { type: 'string' },
                secure_url: { type: 'string' },
              },
            },
            education: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  institution: { type: 'string' },
                  degree: { type: 'string' },
                  field: { type: 'string' },
                  grade: { type: 'string' },
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' }
                }
              }
            },
            experience: {
              type: 'array',
              description: 'Computed from completed internships. `rating` and `feedback` are only populated after both parties submit a rating, or 14 days after completion.',
              items: {
                type: 'object',
                properties: {
                  applicationId: { type: 'string' },
                  internshipId: { type: 'string' },
                  internshipTitle: { type: 'string' },
                  companyId: { type: 'string' },
                  companyName: { type: 'string' },
                  completedAt: { type: 'string', format: 'date-time' },
                  rating: { type: 'integer', nullable: true },
                  feedback: { type: 'string', nullable: true },
                  feedbackCreatedAt: { type: 'string', format: 'date-time', nullable: true },
                }
              }
            },
            dateOfBirth: { type: 'string', format: 'date' },
            gender: { type: 'string', enum: ['male', 'female'] },
            address: { type: 'string' },
            // H1: `avgRating` is NOT persisted — compute on the client as
            // `ratingSum / ratingCount` (default null if ratingCount is 0).
            ratingCount: { type: 'integer', example: 0 },
            ratingSum: { type: 'integer', example: 0 },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          // Note: password, emailOtp, passwordOtp, newEmailOtp, newEmail,
          // isChangeCredentialsUpdated, and __v are NEVER returned to the
          // client. The toSafeUser() projection strips them.
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
            location: {
              type: 'object',
              description: 'Optional coordinates. Returned when the company set a map location.',
              properties: {
                lat: { type: 'number', example: 30.0444 },
                lng: { type: 'number', example: 31.2357 },
              },
            },
            googleMapsUrl: {
              type: 'string',
              description: 'Google Maps link built from location, present only when lat/lng exist.',
              example: 'https://www.google.com/maps/search/?api=1&query=30.0444,31.2357',
            },
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
            companyId: {
              description: 'On the list endpoint this is the raw ObjectId string. On the detail endpoint (`GET /internships/:id`) it is populated with the full Company document, including `googleMapsUrl` when the company has coordinates.',
              oneOf: [
                { type: 'string', example: '60d0fe4f5311236168a109ca' },
                { $ref: '#/components/schemas/Company' },
              ],
            },
            addedBy: { type: 'string', example: '60d0fe4f5311236168a109ca' },
            updatedBy: { type: 'string', example: '60d0fe4f5311236168a109ca' },
            closed: { type: 'boolean', example: false },
            questions: {
              type: 'array',
              description: 'Optional application questions attached to the internship',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['mcq', 'writing'] },
                  prompt: { type: 'string' },
                  options: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            preKnowledge: { type: 'array', items: { type: 'string' }, example: ['Node.js', 'MongoDB'] },
            track: { type: 'array', items: { type: 'string' }, example: ['backend', 'fullstack'] },
            requiredEducation: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  institution: { type: 'string' },
                  degree: { type: 'string' },
                  field: { type: 'string' },
                  grade: { type: 'string' },
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' },
                },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  // The app runs directly from TypeScript source via tsx (no compiled dist output),
  // so only scan src paths. We include bootstrap.ts because that's where
  // /health and the /api/v1/docs endpoints are documented.
  apis: [
    path.join(projectRoot, 'src/modules/**/*.ts'),
    path.join(projectRoot, 'src/routes.ts'),
    path.join(projectRoot, 'src/bootstrap.ts'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);


