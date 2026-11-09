import { app } from './app';
import { env } from './config/env';

app.listen(env.PORT, () => {
  console.log(
    `[SI-PELANTAS KAMSEL MOJOKERTO] Server berjalan pada port ${env.PORT} (${env.NODE_ENV})`
  );
});
