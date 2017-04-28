module.exports = {
  "node_addresses" : [
    "http://localhost:47001",
    "http://localhost:47002",
    "http://localhost:47003"
  ],
  "worker_count" : 5,
  "load_balancer_timeout_min" : 150,
  "load_balancer_timeout_max" : 300,
  "storage_location" : __dirname + '/data/node_state' + process.env.NODEID + '.json',
  "log_location" : __dirname + '/data/node_log' + process.env.NODEID + '.txt',
  'nodeId' : process.env.NODEID
}
