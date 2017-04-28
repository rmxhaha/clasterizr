module.exports = {
  "node_addresses" : [
    "http://localhost:47001",
    "http://localhost:47002",
    "http://localhost:47003"
  ],
  "worker_count" : 5,
  "load_balancer_timeout_min" : 1500,
  "load_balancer_timeout_max" : 3000,
  "storage_location" : __dirname + '/data/node_state' + process.env.NODEID + '.json',
  'nodeId' : process.env.NODEID
}
