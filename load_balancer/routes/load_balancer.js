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

  myNode.receiveAppendLog( appendEntriesRPC ).then(function(result){
    res.json(result);
    console.log("My Answer to vote :" + JSON.stringify(result) );
  }).catch(function(err){
    console.log(err)
  });
})

module.exports = router;
