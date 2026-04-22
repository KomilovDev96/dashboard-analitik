export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/dashboard-analitik',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10) || 6379,
  },
  clickhouse: {
    url: process.env.CLICKHOUSE_URL || 'http://192.168.183.31:8123',
    username: process.env.CLICKHOUSE_USERNAME || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DATABASE || 'eman_materials',
  },
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@dashboard.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin123!',
  },
});
