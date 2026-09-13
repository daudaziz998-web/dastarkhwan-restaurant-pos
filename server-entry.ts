import { startServer } from './server.ts';

// Entry point for standalone development / web server
const port = Number(process.env.PORT) || 3000;
startServer(port).catch((err) => {
  console.error('Failed to start standalone server:', err);
  process.exit(1);
});
