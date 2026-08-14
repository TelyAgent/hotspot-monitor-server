import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'hotspot-monitor-server',
      time: new Date().toISOString(),
    }
  }
}
