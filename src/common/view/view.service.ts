import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Eta } from 'eta';
import type { Env } from '../../config/env';
import * as helpers from '../helpers';

/**
 * Renders Eta templates from `views/` (Blade replacement). Template data is `it`; these helpers
 * are in scope in every template, layout and partial without a prefix:
 * appUrl, url, asset, logo, entityName, isFilled, numberFormat, formatDate, safeNumber, safeDateFormat.
 */
@Injectable()
export class ViewService {
  private readonly eta: Eta & { helpers?: Record<string, unknown> };

  constructor(config: ConfigService<Env, true>) {
    const appUrl = config.get('APP_URL', { infer: true });
    const url = (path = '') => `${appUrl}/${String(path).replace(/^\/+/, '')}`;
    // encodeURI: logo file names contain spaces ("PT JAKARTA INTERNATIONAL EXPO.png").
    const asset = (path: string) => url(encodeURI(`public/${path.replace(/^\/+/, '')}`));

    const templateHelpers = {
      appUrl,
      url,
      asset,
      logo: (name?: unknown) => asset(helpers.entityLogoPath(name)),
      entityName: helpers.entityName,
      isFilled: helpers.isFilled,
      numberFormat: helpers.numberFormat,
      formatDate: helpers.formatDate,
      safeNumber: helpers.safeNumber,
      safeDateFormat: helpers.safeDateFormat,
    };

    this.eta = new Eta({
      views: helpers.VIEWS_DIR,
      cache: config.get('NODE_ENV', { infer: true }) === 'production',
      autoEscape: true,
      autoTrim: [false, 'nl'],
      // Compiled templates run with `this` bound to the Eta instance (also inside include/layout).
      functionHeader: `const { ${Object.keys(templateHelpers).join(', ')} } = this.helpers;`,
    });
    this.eta.helpers = templateHelpers;
  }

  /** @param template path relative to views/, without extension, e.g. 'email/cb/ppu'. */
  render(template: string, data: object = {}): string {
    return this.eta.render(`./${template}`, data);
  }
}
