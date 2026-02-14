import request from 'supertest';

/**
 * E2E Tests — Health & Readiness Endpoints
 *
 * Tests run against the LIVE server on localhost:3200.
 * Prerequisites: backend must be running via PM2.
 */
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3200';

describe('Health & Readiness (E2E)', () => {
  it('GET /health — should return service health', async () => {
    const res = await request(BASE_URL)
      .get('/health')
      .expect(200);

    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('services');
    expect(res.body.services).toHaveProperty('database');
    expect(res.body.services).toHaveProperty('redis');
    expect(res.body.services.database.status).toBe('up');
    expect(res.body.services.redis.status).toBe('up');
  });

  it('GET /ready — should return readiness probe', async () => {
    const res = await request(BASE_URL)
      .get('/ready')
      .expect((response) => {
        // Accept 200 (ready) or 503 (degraded — PHP might be down)
        expect([200, 503]).toContain(response.status);
      });

    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('php');
    expect(res.body).toHaveProperty('latencyMs');
  });

  it('GET /metrics — should return Prometheus metrics', async () => {
    const res = await request(BASE_URL)
      .get('/metrics')
      .expect(200);

    expect(res.text).toContain('process_cpu');
  });

  it('should include X-Trace-Id header in responses', async () => {
    const res = await request(BASE_URL)
      .get('/health');

    expect(res.headers['x-trace-id']).toBeDefined();
    expect(res.headers['x-trace-id']).toMatch(/^trace-/);
  });

  it('should include security headers (Helmet)', async () => {
    const res = await request(BASE_URL)
      .get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

describe('API Protection (E2E)', () => {
  it('should reject invalid webhook secrets', async () => {
    await request(BASE_URL)
      .post('/api/webhooks/orders/tracking')
      .set('x-webhook-secret', 'wrong_secret')
      .send({ event: 'status.changed', data: { status: 'delivered' }, order_id: '999' })
      .expect(400);
  });

  it('should reject payment webhooks without signature', async () => {
    await request(BASE_URL)
      .post('/api/webhooks/orders/payment')
      .send({ event: 'payment.captured', payload: { payment: { entity: { id: 'test' } } } })
      .expect(400);
  });

  it('should return 404 for unknown API routes', async () => {
    await request(BASE_URL)
      .get('/api/definitely-not-a-route')
      .expect(404);
  });

  it('Swagger docs should be accessible', async () => {
    const res = await request(BASE_URL)
      .get('/api/docs')
      .expect((response) => {
        // 200 in dev/staging, 404 in production (Swagger disabled)
        expect([200, 301, 302, 404]).toContain(response.status);
      });
  });
});
