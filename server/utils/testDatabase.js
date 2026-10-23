function validateTestDatabase(testUrl, developmentUrl) {
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required; use a dedicated test database or Neon branch');
  const test = new URL(testUrl);
  if (!['postgres:', 'postgresql:'].includes(test.protocol)) {
    throw new Error('TEST_DATABASE_URL must be a PostgreSQL connection URL');
  }
  if (developmentUrl) {
    const development = new URL(developmentUrl);
    // Compare targets, ignoring credentials and connection options. Neon pooled and
    // direct hosts for the same branch must also count as the same target.
    const target = url => `${url.hostname.replace('-pooler.', '.')}:${url.port || '5432'}${url.pathname}`;
    if (target(test) === target(development)) {
      throw new Error('Test and development database targets must differ; tests erase their data');
    }
  }
  return testUrl;
}

module.exports = { validateTestDatabase };
