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
    console.log(result);
    return Promise.resolve();
  }).catch(function(err){
    console.log(err)
  });
})

router.post('/receiveAppendLog/', function(req, res, next){
  appendEntriesRPC = req.body
  appendEntriesRPC.__proto__ == consensus.AppendEntriesRPC.prototype

  myNode.receiveAppendLog( appendEntriesRPC ).then( res.json );
})

module.exports = router;
