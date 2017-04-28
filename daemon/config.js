module.exports = {
  "node_addresses" : [
    "http://localhost:47001",
    "http://localhost:47002",
    "http://localhost:47003",
    "http://localhost:47004",
    "http://localhost:47005"
  ],
  "storage_location" : __dirname + '/data/node_state' + process.env.NODEID + '.json',
  "log_location" : __dirname + '/data/node_log' + process.env.NODEID + '.txt',
  'send_interval' : 200,
  'daemonId' : process.env.DAEMONID
}
