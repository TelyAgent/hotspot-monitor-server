import { Controller, Get, Query } from '@nestjs/common'
import { AccountService } from './account.service'

@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  /** GET /api/account?type=快讯 — 账号列表（可按类型筛选，默认全部） */
  @Get()
  getAccounts(@Query('type') type?: string) {
    return this.accountService.getAccounts(type)
  }

  /** GET /api/account/types — 所有账号类型 */
  @Get('types')
  getAccountTypes(): Promise<string[]> {
    return this.accountService.getAccountTypes()
  }
}
