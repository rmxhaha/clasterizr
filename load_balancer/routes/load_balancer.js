let express = require('express')
let router = express.Router()
let config = require('../config.js')
let consensus = require('../services/consensus')
let debug = require('../services/debug')

let myNode = new consensus.Node(config, config.nodeId)

/* GET home page. */
router.post('/receiveRequestVote/', function(req, res, next) {
  requestVoteRPC = req.body
  requestVoteRPC.__proto__ == consensus.RequestVoteRPC.prototype

  debug.log( "RequestVote : " + JSON.stringify(requestVoteRPC) );

  myNode.receiveRequestVote( requestVoteRPC ).then(function(result){
    res.json(result);
    debug.log("My Answer to vote :" + JSON.stringify(result) );
  }).catch(function(err){
    debug.log(err)
  });
})

router.post('/receiveAppendLog/', function(req, res, next){
  appendEntriesRPC = req.body
  appendEntriesRPC.__proto__ == consensus.AppendEntriesRPC.prototype

  debug.log( "AppendLog " + JSON.stringify(appendEntriesRPC) )

  myNode.receiveAppendLog( appendEntriesRPC ).then(function(result){
    res.json(result);
    debug.log("My Answer to append :" + JSON.stringify(result) );
  }).catch(function(err){
    debug.log(err)
  });
})

router.get('/receiveNewLog/:workerId/', function(req, res, next) {
  const workerId = req.params.workerId;

  let cpuload = parseInt(req.query.cpuload);
  let workerAddr = req.query.address;

  debug.log( cpuload )

  if( cpuload > 100 )
    cpuload = 100;
  else if( cpuload < 0 )
    cpuload = 0;


  let logData = {}
  logData["worker"+workerId] = { cpuload, workerAddr }


  myNode.receiveNewLog( logData ).then(()=>{
    debug.log( "Worker #" + workerId + ": reporting CPU " + cpuload + "%" );
    res.json({
      'status' : 'ok',
      'message' : 'acknowledged by leader'
    });
  }).catch((err)=>{
    res.json({
      'status' : 'fail',
      'message' : err.message,
      'leader_address' : config.node_addresses[myNode.state.votedFor]
    });
  })
});

router.get('/receiveNewLog/:workerId/', function(req, res, next) {
})
router.get('/getWorkerData/', function(req, res, next) {
  return res.json(myNode.state.currentData)
})
router.get('/getLogs/', function(req, res, next) {
  return res.json(myNode.state.logs)
})
router.get('/getAllState/', function(req, res, next) {
  return res.json(myNode.state)
})
router.get('/getLeaderData/', function(req, res, next) {
  return res.json({
    nextIndex : myNode.nextIndex,
    matchIndex : myNode.matchIndex
  })
})
router.get('/getAllState/', function(req, res, next) {
  return res.json(myNode.state)
})


module.exports = router;
