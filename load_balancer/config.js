module.exports = {
  "load_balancers" : [
    "http://localhost:47001",
    "http://localhost:47002",
    "http://localhost:47003",
    "http://localhost:47004",
    "http://localhost:47005"
  ],
  "worker_count" : 5,
  "load_balancer_timeout_min" : 150,
  "load_balancer_timeout_min" : 300,
  "storage_location" : __dirname + '/data/node_state.json'
}