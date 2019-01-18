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

import { CONFIG } from '../../config'
import { IPFetcher } from '../../fetchers/ip-fetcher'
import { StatsFetcher } from '../../fetchers/stats-fetcher'
import { StatusFetcher } from '../../fetchers/status-fetcher'
import { ConnectionStatusEnum } from '../../libraries/tequil-api/enums'
import TequilApiState from '../../libraries/tequil-api/tequil-api-state'
import IConnectionAdapter, { ConnectionCanceled } from '../adapters/connection-adapter'
import {
  ConnectionEventAdapter,
  StatisticsAdapter
} from '../adapters/statistics-adapter'
import ConnectionData from '../models/connection-data'
import ConnectionStatistics from '../models/connection-statistics'
import ConnectionStatus from '../models/connection-status'
import Ip from '../models/ip'
import ValuePublisher, { Callback } from './observables/value-publisher'

class Connection {
  public get data (): ConnectionData {
    return this._data
  }

  private _data: ConnectionData
  private dataPublisher: ValuePublisher<ConnectionData>
  private statusPublisher: ValuePublisher<ConnectionStatus>
  private ipPublisher: ValuePublisher<Ip>
  private readonly statusFetcher: StatusFetcher
  private readonly ipFetcher: IPFetcher
  private readonly statsFetcher: StatsFetcher

  constructor (
    private readonly connectionAdapter: IConnectionAdapter,
    private readonly tequilApiState: TequilApiState,
    private readonly statisticsManager: StatisticsAdapter
  ) {
    this._data = initialConnectionData

    this.dataPublisher = new ValuePublisher<ConnectionData>(this.data)
    this.statusPublisher = new ValuePublisher<ConnectionStatus>(this.data.status)
    this.ipPublisher = new ValuePublisher<Ip>(this.data.IP)

    this.statusFetcher = this.buildStatusFetcher()
    this.ipFetcher = this.buildIpFetcher()
    this.statsFetcher = this.buildStatsFetcher()
  }

  public startUpdating () {
    const intervals = CONFIG.REFRESH_INTERVALS
    this.statusFetcher.start(intervals.CONNECTION)
    this.ipFetcher.start(intervals.IP)
    this.statsFetcher.start(intervals.STATS)
  }

  public stopUpdating () {
    this.statusFetcher.stop()
    this.ipFetcher.stop()
    this.statsFetcher.stop()
  }

  public async connect (consumerId: string, providerId: string, providerCountryCode: string) {
    this.resetIP()
    this.setStatusToConnecting()

    const connectionEventBuilder = await this.startConnectionTracking(providerId, consumerId, providerCountryCode)

    try {
      await this.connectionAdapter.connect(consumerId, providerId)

      connectionEventBuilder.sendSuccessfulConnectionEvent()
    } catch (error) {
      error instanceof ConnectionCanceled
        ? connectionEventBuilder.sendCanceledConnectionEvent()
        : connectionEventBuilder.sendFailedConnectionEvent(error.message)
    }
  }

  public async disconnect () {
    this.resetIP()
    this.setStatusToDisconnecting()

    await this.connectionAdapter.disconnect()
    console.log('Disconnected')
  }

  public onDataChange (callback: Callback<ConnectionData>) {
    this.dataPublisher.subscribe(callback)
  }

  public onStatusChange (callback: Callback<ConnectionStatus>) {
    this.statusPublisher.subscribe(callback)
  }

  public onIpChange (callback: Callback<Ip>) {
    this.ipPublisher.subscribe(callback)
  }

  public resetIP () {
    this.updateIP(null)
  }

  public setStatusToConnecting () {
    this.updateStatus(ConnectionStatusEnum.CONNECTING)
  }

  public setStatusToDisconnecting () {
    this.updateStatus(ConnectionStatusEnum.DISCONNECTING)
  }

  private updateIP (ip: string | null) {
    this.setData(new ConnectionData(this.data.status, ip, this.data.connectionStatistics))
  }

  private buildStatusFetcher (): StatusFetcher {
    const fetchStatus = this.connectionAdapter.fetchStatus.bind(this.connectionAdapter)
    return new StatusFetcher(fetchStatus, this.tequilApiState, status => {
      this.updateStatus(status.status)
    })
  }

  private buildIpFetcher (): IPFetcher {
    const fetchIp = this.connectionAdapter.fetchIp.bind(this.connectionAdapter)
    return new IPFetcher(fetchIp, this, ip => {
      this.updateIP(ip)
    })
  }

  private buildStatsFetcher (): StatsFetcher {
    const fetchStatistics = this.connectionAdapter.fetchStatistics.bind(this.connectionAdapter)
    return new StatsFetcher(fetchStatistics, this, stats => {
      this.updateStatistics(stats)
    })
  }

  private updateStatistics (statistics: ConnectionStatistics) {
    this.setData(new ConnectionData(this.data.status, this.data.IP, statistics))
  }

  private updateStatus (status: ConnectionStatus) {
    this.setData(new ConnectionData(status, this.data.IP, this.data.connectionStatistics))
  }

  private setData (data: ConnectionData) {
    if (this._data === data) {
      return
    }

    if (this._data.status !== data.status) {
      this.statusPublisher.publish(data.status)
    }

    if (this._data.IP !== data.IP) {
      this.ipPublisher.publish(data.IP)
    }

    this.dataPublisher.publish(data)
    this._data = data
  }

  private async startConnectionTracking (
    providerId: string,
    consumerId: string,
    providerCountryCode: string): Promise<ConnectionEventAdapter> {
    const countryDetails = {
      originalCountry: await this.connectionAdapter.fetchOriginalLocation(),
      providerCountry: providerCountryCode
    }

    const connectionDetails = { consumerId, providerId }

    return this.statisticsManager.startConnectionTracking(connectionDetails, countryDetails)
  }
}

const initialStatistics: ConnectionStatistics = {
  duration: 0,
  bytesSent: 0,
  bytesReceived: 0
}
const initialIp = null
const initialStatus = ConnectionStatusEnum.NOT_CONNECTED

const initialConnectionData = new ConnectionData(initialStatus, initialIp, initialStatistics)

export default Connection
