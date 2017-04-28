let express = require('express')
let router = express.Router()
let config = require('../config.js')
let consensus = require('../services/consensus')

let myNode = new consensus.Node(config, config.nodeId)

/* GET home page. */
router.post('/receiveRequestVote/', function(req, res, next) {
  requestVoteRPC = req.body
  requestVoteRPC.__proto__ == consensus.RequestVoteRPC.prototype

  console.log( requestVoteRPC );

  myNode.receiveRequestVote( requestVoteRPC ).then(function(result){
    res.json(result);
    console.log("My Answer to vote :" + JSON.stringify(result) );
  }).catch(function(err){
    console.log(err)
  });
})

router.post('/receiveAppendLog/', function(req, res, next){
  appendEntriesRPC = req.body
  appendEntriesRPC.__proto__ == consensus.AppendEntriesRPC.prototype

  console.log( appendEntriesRPC )

  myNode.receiveAppendLog( appendEntriesRPC ).then(function(result){
    res.json(result);
    console.log("My Answer to append :" + JSON.stringify(result) );
  }).catch(function(err){
    console.log(err)
  });
})

router.get('/receiveNewLog/:worker_id/', function(req, res, next) {
  const workerId = req.params.workerId;

  let cpuload = parseInt(req.query.cpuload);
  let workerAddr = req.query.address;

  console.log( cpuload )

  if( cpuload > 100 )
    cpuload = 100;
  else if( cpuload < 0 )
    cpuload = 0;


  let logData = {}
  logData["worker"+workerId] = { cpuload, workerAddr }


  myNode.receiveNewLog( logData ).then(()=>{
    console.log( "Worker #" + workerId + ": reporting CPU " + cpuload + "%" );
    res.json({
      'status' : 'ok',
      'message' : 'acknowledged by leader'
    });
  }).catch((err)=>{
    res.json({
      'status' : 'fail',
      'message' : err.message
    });
  })


});

module.exports = router;
