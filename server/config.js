const required = (name, fallback = '') => {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`缺少必要环境变量：${name}`)
  return value
}

export const config = {
  port: Number(process.env.PORT || 3000),
  mysql: {
    host: process.env.MYSQL_HOST || 'mysql',
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE || 'personal_workbench',
    user: process.env.MYSQL_USER || 'pwb',
    password: required('MYSQL_PASSWORD', 'pwb_dev_password'),
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10)
  },
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: required('ADMIN_PASSWORD', 'change-me-now'),
  tokenSecret: required('TOKEN_SECRET', 'development-secret-change-in-production'),
  tokenHours: Number(process.env.TOKEN_HOURS || 168),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean)
}

if (process.env.NODE_ENV === 'production') {
  const unsafe = [
    config.adminPassword === 'change-me-now' && 'ADMIN_PASSWORD',
    config.tokenSecret === 'development-secret-change-in-production' && 'TOKEN_SECRET',
    config.mysql.password === 'pwb_dev_password' && 'MYSQL_PASSWORD'
  ].filter(Boolean)
  if (unsafe.length) throw new Error(`生产环境必须设置安全值：${unsafe.join(', ')}`)
}
