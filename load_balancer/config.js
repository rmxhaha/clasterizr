module.exports = {
  "node_addresses" : [
    "http://90.90.5.110:47001",
    "http://90.90.5.110:47002",
    "http://90.90.5.110:47003",
    "http://90.90.5.120:47004",
    "http://90.90.5.120:47005"
  ],
  "worker_count" : 5,
  "load_balancer_timeout_min" : 150,
  "load_balancer_timeout_max" : 300,
  "storage_location" : __dirname + '/data/node_state' + process.env.NODEID + '.json',
  "log_location" : __dirname + '/data/node_log' + process.env.NODEID + '.txt',
  'nodeId' : process.env.NODEID
}
