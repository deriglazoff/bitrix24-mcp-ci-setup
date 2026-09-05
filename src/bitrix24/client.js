import axios from 'axios';
import { RateLimiter } from '../utils/rate-limiter.js';
import { assertReadOnly, isReadOnly } from './readonly.js';

const MAX_RETRIES = 3;

export class Bitrix24Client {
  // readOnly — свойство КЛИЕНТА (а не только глобального env): клиент на общем
  // вебхуке наследует глобальный isReadOnly(), а клиент на личном write-вебхуке
  // создаётся с readOnly: false и может писать под учёткой владельца вебхука.
  constructor(webhookUrl, { readOnly } = {}) {
    this.webhookUrl = webhookUrl.endsWith('/') ? webhookUrl : webhookUrl + '/';
    this.limiter = new RateLimiter(500);
    this.portal = this._extractPortal(webhookUrl);
    this.readOnly = readOnly === undefined ? isReadOnly() : readOnly;
  }

  _extractPortal(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  async call(method, params = {}, retries = 0) {
    assertReadOnly(method, params, this.readOnly); // блокирует запись, если клиент read-only
    return this.limiter.schedule(async () => {
      try {
        const url = `${this.webhookUrl}${method}.json`;
        const response = await axios.post(url, params, { timeout: 30000 });
        if (response.data.error) {
          throw new Error(`Bitrix24 error [${response.data.error}]: ${response.data.error_description}`);
        }
        return response.data;
      } catch (err) {
        if (err.response?.status === 429 && retries < MAX_RETRIES) {
          const retryAfter = parseInt(err.response.headers['retry-after'] || '2', 10);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          return this.call(method, params, retries + 1);
        }
        if (err.code === 'ECONNABORTED' && retries < MAX_RETRIES) {
          const backoff = Math.pow(2, retries) * 1000;
          await new Promise(r => setTimeout(r, backoff));
          return this.call(method, params, retries + 1);
        }
        throw err;
      }
    });
  }
}
