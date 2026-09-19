import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { initDatabase, closeDatabase } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrate.js';
import { seedDatabase } from '../src/database/seed.js';
import { normalizePhoneNumber, isValidIndianPhone } from '../src/utils/phone.js';
import type { FastifyInstance } from 'fastify';

describe('Phone Normalization Utils', () => {
  it('should normalize 10-digit number to canonical +91 format', () => {
    expect(normalizePhoneNumber('9876543210')).toBe('+919876543210');
  });

  it('should normalize number with +91 prefix to canonical format', () => {
    expect(normalizePhoneNumber('+919876543210')).toBe('+919876543210');
  });

  it('should normalize number with spaces, hyphens, and leading zero', () => {
    expect(normalizePhoneNumber('098765-43210')).toBe('+919876543210');
    expect(normalizePhoneNumber('+91 98765 43210')).toBe('+919876543210');
  });

  it('should reject invalid or malformed numbers', () => {
    expect(isValidIndianPhone('12345')).toBe(false);
    expect(isValidIndianPhone('1234567890')).toBe(false); // Does not start with 6-9
    expect(isValidIndianPhone('abc9876543210')).toBe(false);
  });
});

describe('Authentication API', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let engineerToken: string;

  beforeAll(async () => {
    await initDatabase();
    await runMigrations();
    await seedDatabase();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('POST /api/v1/auth/login should succeed with valid admin credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '9876543210', // 10-digit format
        password: 'Admin@123456',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.user.role).toBe('admin');
    expect(body.data.user.phone).toBe('+919876543210');
    adminToken = body.data.accessToken;
  });

  it('POST /api/v1/auth/login should succeed with +91 format phone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '+919123456789',
        password: 'Site@123456',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.user.role).toBe('site_engineer');
    engineerToken = body.data.accessToken;
  });

  it('POST /api/v1/auth/login should fail with incorrect password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '9876543210',
        password: 'WrongPassword!',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTHENTICATION_FAILED');
  });

  it('POST /api/v1/auth/login should fail with non-existent phone number', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '9999999999',
        password: 'AnyPassword123',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
  });

  it('POST /api/v1/auth/login should return 400 for malformed input', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '123', // Invalid phone
        password: 'short',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /api/v1/auth/me should succeed with valid Bearer token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.user.phone).toBe('+919876543210');
  });

  it('GET /api/v1/auth/me should return 401 without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /api/v1/auth/logout should succeed for authenticated user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
  });
});
