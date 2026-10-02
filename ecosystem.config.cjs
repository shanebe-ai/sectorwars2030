// Production process list for tmcdonald.ca. Managed with:
//   pm2 startOrRestart ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "tradewars-server",
      cwd: "/home/tradewars/server",
      script: "dist/server/src/index.js",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
    {
      name: "tradewars-client",
      cwd: "/home/tradewars/client",
      script: "node_modules/.bin/vite",
      args: "preview --port 5173 --host",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "tradewars-admin",
      cwd: "/home/tradewars/admin",
      script: "node_modules/.bin/vite",
      args: "preview --port 5174 --host",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
