let fs = require('fs');
let Promise = require('bluebird');
var rp = require('request-promise');

class StateMachine {
  constructor(){
    this.state = {};
  }
  apply( log ){
    this.state = Object.assign( this.state, log );
  }
}


class Node {
  constructor(config, nodeId){
    console.log("Node with "+nodeId +" constructed")
    this.config = config

    // non volatile only
    this.state = this.readState()

    // volatile state
    this.nodeId = nodeId
    this.position = "follower"
    this.leaderAddress = this.config.node_addresses[nodeId]

    // volatile state for candidate only
    this.approvalCount = 1

    // volatile state for leader only
    this.nextIndex = []
    this.matchIndex = []
    this.childTimer = []

    this.resetTimer();
  }

  // -- timeout related
  getRandomFollowerTimeout(){
    return Math.floor(this.config.load_balancer_timeout_max - this.config.load_balancer_timeout_min) * Math.random() + this.config.load_balancer_timeout_min;
  }

  getHeartbeatTimeout(){
    return this.config.load_balancer_timeout_min/2;
  }

  resetTimer(){
    clearTimeout(this.timer);
    let timeout = this.getRandomFollowerTimeout();
    this.timer = setTimeout(this.triggerTimeout.bind(this), timeout );
  }

  triggerTimeout(){
    console.log("Node timedout")
    if( this.position == "follower" ){
      this.changePositionTo("candidate");
    }
    else if( this.state == "candidate" ){
      this.changePositionTo("candidate");
    }
  }

  changePositionTo(newPos){
    if( this.position == "follower" && newPos == "leader" )
      throw new Error("A bug is detected");
    if( this.position == "leader" && newPos == "candidate" )
      throw new Error("A bug is detected");

    console.log("Node change position "+newPos)

    if( this.position == "leader" ){
      // pasti jd follower lagi
      this.resetTimer(); // re init timeout
    }

    if( this.position == "candidate" && newPos == "leader" ){
      // disable timer
      clearTimeout(this.timer)

      // init leader's variable
      this.nextIndex = []
      this.matchIndex = []
      let lastLogIndex = node.state.logs.length-1
      for( let i = 0; i < this.config.node_addresses.length; ++ i ){
        if( i == this.nodeId ) continue;

        this.nextIndex[i] = lastLogIndex
        this.matchIndex[i] = 0
        this.childTimer[i] = setTimeout( sendAppendLog.bind(this, i), this.getHeartbeatTimeout() * 6 );
      }
    }

    // if candidate - candidate an election have failed
    // - split vote happened or
    // - majority of server is down
    // - network partition happened
    // re elect and re broadcast

    if( newPos == "candidate" ){
      this.state.currentTerm ++;

      // broadcast asking for an election
      let arr = []
      for( let i = 0; i < this.config.node_addresses.length; ++ i ){
        if( i == this.nodeId ) continue;
        arr[i] = this.sendRequestVote( i );
      }

      // majority ok
      let majority = Math.ceil( this.config.node_addresses.length/2)
      let node = this
      Promise.some(arr, majority).then(function(){
        node.changePositionTo("leader")
      }).catch(function(){
        setTimeout(node.changePositionTo.bind(node,"candidate"), node.getHeartbeatTimeout())
      })
    }

    this.position = newPos;
  }

  // -- timeout related ends

  updateCommitIndex(){
    // check if can increase commitedIndex
    let majority = Math.ceil( this.config.node_addresses.length/2)

    let cidx = this.state.commitedIndex
    for(;;){
      let res = this.matchIndex.filter( (i) => i > cidx );
      if( res.length < majority )
        break;
      this.state.commitedIndex = cidx = Math.min.apply(null, res)
    }
  }

  sendAppendLog( to ){
    let appendEntriesRPC = new AppendEntriesRPC( this, to );
    let node = this;

    return rp({
      method : "POST",
      uri : this.config.node_addresses[to] + "/load_balancer/receiveAppendLog",
      body : appendEntriesRPC,
      json : true
    }).then(function(response){
      if( response.statusCode != 200 )
        return Promise.reject(new Error("Status Code "+ response.statusCode));

      let res = JSON.parse( response.body );

      if( res.result == "negative" ){
        node.nextIndex[to] --; // move back and try again
      }
      else if( res.result == "positive" ){
        if( appendEntriesRPC.entry != null ){ // sending something
          node.matchIndex[to] = appendEntriesRPC.prevLogIndex + 1;
          node.nextIndex[to] = appendEntriesRPC.prevLogIndex + 2;
          node.updateCommitIndex();
        }
      }
    }).catch(function(err){
      console.log(err);
    }).finally(function(){
      node.childTimer[to] = setTimeout( sendAppendLog.bind(node, i), node.getHeartbeatTimeout() );
    });
  }

  sendRequestVote( to ){
    let node = this;
    let requestVoteRPC = new RequestVoteRPC(this);

    return rp({
      method : "POST",
      uri : this.config.node_addresses[to] + "/load_balancer/receiveRequestVote",
      body : requestVoteRPC,
      json : true
    }).then(function(response){
      if( response.statusCode != 200 ){
        return Promise.reject();
      }

      if( res.term > node.state.currentTerm ){
        this.state.currentTerm = res.term;
        writeState();
        return changePositionTo("follower");
      }


      let res = JSON.parse( response.body );
      if( res.type == "negative" )
        return Promise.reject()

      return Promise.resolve()
    })
  }

  receiveRequestVote( requestVoteRPC ){
    this.resetTimer();

    // kalau higher pasti itu aneh
    if( this.state.currentTerm > requestVoteRPC.term ){
      return replyNegative();
    }
    else if( this.state.currentTerm == requestVoteRPC.term ){
      if( this.state.votedFor == requestVoteRPC.candidateId )
        // candidate request vote 2x perhaps it doesn't
        return replyPositive();
      else
        // 2 candidate timeout bareng jd udah vote intinya
        return replyNegative();
    }
    else { // currentTerm < request.term
      let maxLogIndexReceived = this.state.logs.length-1;

      // This node have more log than you, so you can't be leader
      if( maxLogIndexReceived > requestVoteRPC.lastLogIndex )
        return replyNegative();

      this.state.votedFor = requestVoteRPC.candidateId
      this.state.currentTerm = requestVoteRPC.term
      this.changePositionTo("follower");
      return replyPositive();
    }
  }

  receiveAppendLog( appendEntriesRPC ){
    this.resetTimer();

    appendEntriesRPC.__proto__ = appendEntriesRPC.prototype;
    let maxLogIndexReceived = this.state.logs.length-1;

    // new leader appear for some reason
    if( appendEntriesRPC.term > this.state.currentTerm ){
      this.state.votedFor = appendEntriesRPC.leaderId;
      this.state.currentTerm = appendEntriesRPC.term;
      writeState();
      this.changePositionTo("follower");
    }

    // -- stale leader
    if( appendEntriesRPC.term < this.state.currentTerm ){
      return replyNegative();
    }

    // -- log inconsistency


    // leader send beyond current log
    else if( appendEntriesRPC.prevLogIndex > maxLogIndexReceived ){
      return replyNegative();
    }
    // leader send inconsistent log
    else if( this.state.logs[appendEntriesRPC.prevLogIndex].term != appendEntriesRPC.prevLogTerm ){
      return replyNegative();
    }
    // -- normal case
    else {
      return this.processEntries( appendEntriesRPC ).then( replyPositive );
    }
  }

  processEntries( appendEntriesRPC ){
    // append entry if not null
    if( appendEntriesRPC.entry != null )
      this.state.logs.push( appendEntriesRPC.entry );

    // commit if not commited
    let currentData = this.state.currentData;
    let Limit = Math.min( this.state.logs.length-1, appendEntriesRPC.commitedIndex );

    // applying commited log to state machine
    for( let i = this.state.commitedIndex + 1; i <= Limit; ++ i ){
      currentData = Object.assign( currentData, this.logs[i].data );
    }

    this.state.commitedIndex = Limit;

    // write to non volatile media
    writeState(); // synchronous

    return Promise.resolve();
  }

  replyPositive(){
    return Promise.resolve({
      type : 'positive',
      term : this.state.currentTerm
    });
  }

  replyNegative(){
    return Promise.resolve({
      type : 'negative',
      term : this.state.currentTerm
    })
  }

  writeState(){
    const fileloc = this.config.storage_location;
    if( fs.existsSync(fileloc) )
      fs.unlinkSync( fileloc );
    fs.writeFileSync( fileloc, JSON.stringify(this.state), 'utf8');
  }

  readState(){
    const fileloc = this.config.storage_location;
    const __default = {
      currentTerm : 1,
      logs : [], // starts with index 1
      commitedIndex : 0,
      lastApplied : 0,
      votedFor : null,
      currentData : {} // state machine
    };
    console.log(fileloc);
    if( !fs.existsSync(fileloc) ){
      console.log("Fail to read");
      return __default;
    }

    try {
      let data = fs.readFileSync( fileloc, 'utf8');
      return JSON.parse(data);
    }
    catch(err){
      console.log("Fail to read");
      return __default;
    }
  }
}


class AppendEntriesRPC {
  constructor(leaderNode, targetIdx){
    let node = leaderNode
    let maxLogIndex = leader_node.state.logs.length-1
    this.term = node.state.currentTerm
    this.leaderId = node.nodeId
    this.prevLogIndex = leader_node.nextIndex[targetIdx]-1
    this.prevLogTerm = leader_node.state.logs[this.prevLogIndex].term
    if( this.prevLogIndex + 1 > maxLogIndex ) // heartbeat
      this.entry = null;
    else
      this.entry = leader_node.state.logs[this.prevLogIndex+1];
    this.commitedIndex = leader_node.commitedIndex;
  }
}

class RequestVoteRPC {
  constructor(leaderNode){
    let node = leaderNode
    this.term = node.state.currentTerm
    this.candidateId = node.nodeId
    this.lastLogIndex = node.state.logs.length-1
    if( this.lastLogIndex >= 1 )
      this.lastLogTerm = node.state.logs[this.lastLogIndex].term;
    else
      this.lastLogTerm = 1;
  }
}

class Log {
  constructor(idx, term, workerId, cpuload){
    this.logId = idx
    this.term = term
    this.data = { workerId, cpuload }
  }
}
/*
class raftConsensusNode {
  constructor(config, node_id){
    this.node_id = node_id;
    this.address = this.conf.load_balancers[node_id];

    this.term = 1; // terms start with 1
    this.commitedIndex = 0; // if log_commited = 3 means logs[3] is commited // index start with 1
    this.votedFor = node_id; // node start with 0
    this.state = "follower"; // can be follower, leader, candidate

    this.config = config;
    this.worker_cpuloads = []; // data that require consensus
    this.logs = [];

    resetTimer();

    const heartbetaRate = this.config.load_balancer_timeout_min/2;
    setInterval( this.routine.bind(this), heartbetaRate );
  }

  // call this at heartbeat rate
  routine(){
    if( this.state == "follower" ){
      return; // do nothing
    }
    else if( this.state == "candidate" ){
      broadcastRequestVote();
    }
    else if( this.state == "leader" ){
      broadCastHeartbeat();
    }
  }

  // send request to be a leader to all node and vote for one selves
  broadcastRequestVote(){
    for( let i = 0; i < this.config.load_balancers; ++ i ){
      if( i != this.node_id ){
        // send request terms and id

      }
    }
  }

  broadCastHeartbeat(){
    for( let i = 0; i < this.config.load_balancers; ++ i ){
      if( i != this.node_id ){
        // send terms and current commited log

      }
    }
  }

  initLeader(){
    this.state = "leader";
    this.slaves = [];
    for( let i = 0; i < this.config.load_balancers.length; ++ i ){
      if( i == this.node_id ) continue;

      this.slaves.push({
        id : i,
        address : this.config.load_balancers[i],
        commitedIndex : this.commitedIndex,
        timer : setTimeout( resurrect, getRandomHeartbeatTimeout() ) // for if no reply from heartbeat
      });
    }
  }

  getRandomFollowerTimeout(){
    return (this.config.load_balancer_timeout_max - this.config.load_balancer_timeout_min) * Math.random() + this.config.load_balancer_timeout_min;
  }

  getRandomHeartbeatTimeout(){
    return getRandomFollowerTimeout()/2;
  }

  resetTimer(){
    clearTimeout(this.timer);
    let timeout = this.getRandomFollowerTimeout();
    this.timer = setTimeout(this.triggerTimeout.bind(this), timeout );
  }

  triggerTimeout(){
    if( this.state == "follower" ){
      this.state = "candidate";

      this.approvalCount = 1; // vote for oneself
      this.term ++;
      // broadcast asking for an election
      broadcastRequestVote();
    }
    else if( this.state == "candidate" ){
      // an election have failed -> split vote happened
      // re elect and re broadcast

      this.approvalCount = 1; // vote for oneself
      this.term ++;
      // broadcast asking for an election
      broadcastRequestVote();
    }
  }

  triggerReceiveHeartbeat(type, logData){
    this.resetTimer(); // if type == 'nothing'
    if( this.state == "candidate" )
      this.state = "follower";

    if( type == "append" )
      this.logs[logData.id] = new raftLog(logData); // still pseudo code
    if( type == "commit" )
      this.log_commited = logData.id;
  }



  // called if a follow replied with an ok
  triggerRequestVoteApproval(){
    this.approvalCount++;
    // majority reached
    if( this.approvalCount > this.config.load_balancers.length/2 ){
      initLeader(); // ?
    }
  }

  triggerReceiveRequestVote(term, log_commited){
    if( this.log_commited > log_commited || this.term > term ){
      // deny election request
      return;
    }

    // ok
    // reset to follower state
    this.state = "follower";
    this.term = term;

    // send approval
  }
}
*/


module.exports = {
  Node,
  Log,
  AppendEntriesRPC,
  RequestVoteRPC
};