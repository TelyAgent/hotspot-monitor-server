import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { SettingsService, SettingPayload } from './settings.service'

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** GET /api/settings/:category — 某分区列表（audit 为审计记录） */
  @Get(':category')
  getItems(@Param('category') category: string) {
    return this.settingsService.getItems(category)
  }

  /** POST /api/settings/:category — 新增配置项 */
  @Post(':category')
  createItem(
    @Param('category') category: string,
    @Body() body: SettingPayload,
  ) {
    return this.settingsService.createItem(category, body)
  }

  /** PUT /api/settings/:category/:id — 更新配置项 */
  @Put(':category/:id')
  updateItem(
    @Param('category') category: string,
    @Param('id') id: string,
    @Body() body: SettingPayload,
  ) {
    return this.settingsService.updateItem(category, id, body)
  }

  /** DELETE /api/settings/:category/:id — 删除配置项 */
  @Delete(':category/:id')
  deleteItem(
    @Param('category') category: string,
    @Param('id') id: string,
  ) {
    return this.settingsService.deleteItem(category, id)
  }
}
