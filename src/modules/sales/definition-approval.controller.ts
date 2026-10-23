import { Body, Controller, Get, Param, Post, Res, type Type } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestInput } from '../../common/helpers';
import { DefinitionApprovalService, type ApprovalDefinition } from './definition-approval.service';

/**
 * Thin controller for one ApprovalDefinition, mounted at `api/<def.link>`:
 *   POST /                  → send the approval email (JSON callback, HTTP status = callback Status)
 *   POST /getaccess         → run the stored procedure, render the result page
 *   GET  /:status/:encrypt  → confirmation form
 */
export function definitionController(def: ApprovalDefinition, name: string): Type<unknown> {
  @Controller(`api/${def.link}`)
  class DefinitionController {
    constructor(readonly service: DefinitionApprovalService) {}

    @Post()
    async mail(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
      const callback = await this.service.mail(def, body);
      res.status(callback.Status);
      return callback;
    }

    @Post('getaccess')
    getAccess(@Body() body: RequestInput) {
      return this.service.getAccess(def, body);
    }

    @Get(':status/:encrypt')
    confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
      return this.service.confirm(def, status, encrypt);
    }
  }

  Object.defineProperty(DefinitionController, 'name', { value: name });
  return DefinitionController;
}
