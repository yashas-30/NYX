module.exports = {
  apps: [
    {
      name: 'nyx-api',
      script: './dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        instances: 1, // Dev usually runs 1 instance for easier debugging
      }
    }
  ]
};
