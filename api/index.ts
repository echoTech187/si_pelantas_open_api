import { app } from '../src/app';

export default function handler(req: any, res: any) {
  // Normalize root path if rewritten with /api or empty
  if (!req.url || req.url === '/api' || req.url === '/api/' || req.url === '') {
    req.url = '/';
  }
  return app(req, res);
}

module.exports = handler;
module.exports.default = handler;
