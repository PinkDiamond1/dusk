import {Admin} from 'web3-eth-admin'
import net from 'net'
import os from 'os'
import disk from 'diskusage'
import axios from 'axios'
import consola from 'consola'
import NanoTimer from 'nanotimer'
import NodeCache from 'node-cache'

const ONE_DAY = 86400

let web3Admin = null

const geo = new NodeCache({stdTTL: ONE_DAY})

const polling = {
  peers: {
    cache: [],
    timer: new NanoTimer(),
    interval: '5s',
    method: function() {
      if (web3Admin) {
        consola.info('checking peers')
        // get our nodes info first
        web3Admin.getNodeInfo(function(err, info) {
          if (err) {
            consola.error(new Error(err))
          } else {
            polling.nodeInfo = parseNode(info, true)
            web3Admin.getPeers(function(err2, peers) {
              if (err2) {
                consola.error(new Error(err2))
              } else {
                polling.peers.cache = n(peers)
                polling.peers.cache.unshift(polling.nodeInfo)
                polling.systemInfo = {
                  totalmem: os.totalmem(),
                  freemem: os.freemem(),
                  loadavg: os.loadavg(),
                  cpus: os.cpus(),
                  diskusage: disk.checkSync(os.homedir())
                }
              }
            })
          }
        })
      }
    }
  },
  nodeInfo: {},
  systemInfo: {}
}

export default {
  async init(ipcPath, cb) {
    web3Admin = await new Admin(ipcPath, net)
    return cb()
  },
  startPolling(name) {
    polling[name].timer.setTimeout(polling[name].method, '', '5s')
    polling[name].timer.setInterval(polling[name].method, '', polling[name].interval) // repeat
    return
  },
  getPeers() {
    return polling.peers.cache
  },
  getCountryCode(ip) {
    return geo.get(ip)
  },
  getNodeInfo() {
    return polling.nodeInfo
  },
  getSystemInfo() {
    return polling.systemInfo
  }
}

const n = function(peers) {
  let info = []
  for (const i in peers) {
    info.push(parseNode(peers[i], false))
  }
  return info
}

const parseNode = function(node, local) {
  // "Gubiq/v3.0.1-andromeda-834c1f86/linux-amd64/go1.13.5"
  // "Gubiq/UbiqMainnet/v3.0.1-andromeda-834c1f86/linux-amd64/go1.13.5"
  const peer = {}
  const name = node.name
  let split = name.split('/')
  peer.client = split[0]
  const version = split[1].substr(0, 1) === 'v' ? split[1] : split[2]
  const vsplit = version.split('-')
  peer.version = vsplit[0]
  peer.tag = vsplit[1]
  peer.build = vsplit[2]
  const platform = split[1].substr(0, 1) === 'v' ? split[2] : split[3]
  split = platform.split('-')
  peer.os = split[0]
  peer.arch = split[1]
  peer.raw = node
  peer.localhost = local
  const ip = local ? node.ip : node.network.remoteAddress.split(':')[0]
  let countryCode = geo.get(ip)
  if (countryCode == undefined) {
    axios.get('https://ip2c.org/' + ip)
      .then( function(response) {
        const set = geo.set(ip, response.data)
        countryCode = response.data
        peer.country = countryCode.split(';')[1]
        return peer
      })
      .catch( function(err) {
        consola.error(new Error(err))
        peer.country = ""
        return peer
      })
  } else {
    peer.country = countryCode.split(';')[1]
    return peer
  }
}
