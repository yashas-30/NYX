module.exports = {
  apps: [
    {
      name: 'nyx-api',
      script: './dist-server/server.mjs',
      instances: process.env.NODE_ENV === 'production' ? 'max' : 1,
      exec_mode: process.env.NODE_ENV === 'production' ? 'cluster' : 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'nyx-worker',
      script: './dist-server/worker.mjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
