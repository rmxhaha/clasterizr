# clasterizr

**Clasterizr** is an implementation of basic Raft Consensus algorithm. This Raft Implementation may not be perfect but is based on [Raft Paper](https://raft.github.io/raft.pdf). 
This Raft Implementation doesn't support online configuration changes such as adding node on the fly. This Raft Implementation doesn't support log compaction. Log will grow with time. 

This Raft Implementation is just a prove of concept that I've learn and understand Raft Consensus Algorithm. Please don't use this as a base for your assignment or a base for your production system. Please refer directly to [Raft Paper](https://raft.github.io/raft.pdf) if you want to implement Raft.

**Clasterizr** has 3 parts. 
* Load Balancer
* Worker
* Daemon

## Load Balancer
Load Balancer will synchronize with each other with raft consensus algorithm. If request comes into load balancer. The load balancer will reverse proxy request to worker with lowest CPU percentage. 

## Worker
Worker accepts HTTP request in a single ports and return result as any other web server.

## Daemon
Daemon reports CPU Usage of current node to load balancer every 5 seconds.

