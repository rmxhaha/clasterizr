"use strict"

let rp = require('request-promise')
let config = require('./config.js')
let Promise = require('bluebird')
let osu = require('os-utils')

setInterval(()=>{
  osu.cpuUsage((cpuload)=>{
    cpuload = Math.ceil( cpuload * 100)
    console.log(cpuload)
    let arr = []
    for( let i = 0; i < config.node_addresses.length; ++ i )
      arr.push(
        rp({
          method : "GET",
          uri : config.node_addresses[i] + "/load_balancer/receiveNewLog/" + config.daemonId + "/?cpuload="+cpuload+"&address=" + config.workerAddr
        })
          .then((body)=>{
            if( body.status == "fail" )
              return Promise.reject()
            return Promise.resolve()
          })
      )

    Promise.any(arr)
      .then(()=>console.log("send ok"))
      .catch(()=>console.log("cannot contact load balancer"))

  })

}, config.send_interval)
