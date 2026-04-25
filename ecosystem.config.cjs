module.exports = {
  apps: [
    {
      name: 'ponzubot',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      cwd: 'F:/git/ponzu-sababot',
      env_production: {
        NODE_ENV: 'production',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
