/*
 * Copyright (C) 2018 The 'MysteriumNetwork/mysterion' Authors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import Connection from '../app/domain/connection'
import ConnectionStatus from '../app/models/connection-status'
import Ip from '../app/models/ip'
import { ConnectionStatusEnum } from '../libraries/tequil-api/enums'
import { FetcherBase } from './fetcher-base'

type ConnectionIP = () => Promise<Ip>

export class IPFetcher extends FetcherBase<Ip> {
  private lastStatus?: ConnectionStatus

  constructor (private connectionIP: ConnectionIP, private connection: Connection, update: (ip: Ip) => void) {
    super('IP', update)
  }

  public start (interval: number) {
    super.start(interval)

    if (this.isStarted) {
      return
    }
    this.connection.onDataChange(data => {
      this.handleConnectionStatusChange(data.status)
    })
  }

  protected async fetch (): Promise<Ip> {
    return this.connectionIP()
  }

  // TODO: move this logic out to Connection and move fetchers into /core
  private handleConnectionStatusChange (status: ConnectionStatus) {
    if (status === this.lastStatus) {
      return
    }
    this.lastStatus = status

    if (status === ConnectionStatusEnum.CONNECTED || status === ConnectionStatusEnum.NOT_CONNECTED) {
      this.refresh().catch(error => {
        console.error('IPFetcher refresh failed:', error)
      })
    }
  }
}
