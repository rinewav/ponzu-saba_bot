module.exports = {
  apps: [
    {
      name: 'ponzubot',
      script: 'npx',
      args: 'tsx src/index.ts',
      cwd: 'F:/git/ponzu-sababot',
      env_production: {
        NODE_ENV: 'production',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
