"use strict";

let fs = require('fs');
let Promise = require('bluebird');
let rp = require('request-promise');
let debug = require('./debug')

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
    debug.log("Node with "+nodeId +" constructed")
    this.config = config

    // non volatile only
    this.state = this.readState()
    this.writeState() // in case first time

    // volatile state
    this.nodeId = nodeId
    this.leaderAddress = this.config.node_addresses[nodeId]

    // volatile state for candidate only
    this.candidateRequestVotes = []

    // volatile state for leader only
    this.nextIndex = []
    this.matchIndex = []
    this.childTimer = []

    this.changePositionTo("follower")
    this.changePositionTo("candidate")
  }

  // -- timeout related
  getRandomFollowerTimeout(){
    let max = this.config.load_balancer_timeout_max
    let min = this.config.load_balancer_timeout_min
    return Math.floor( (max-min) * Math.random() + min );
  }

  getHeartbeatTimeout(){
    return this.config.load_balancer_timeout_min/2;
  }

  getElectionTimeout(){
    return this.config.load_balancer_timeout_max * 5;
  }

  resetTimer(){
    clearTimeout(this.timer);
    let timeout = 0
    if( this.position == "follower" ){
      timeout = this.getRandomFollowerTimeout()
      debug.log("Node Timeout reset to " + timeout)
      this.timer = setTimeout(this.triggerTimeout.bind(this), timeout );
    }
    else if( this.position == "candidate" ){
      timeout = this.getElectionTimeout()
      debug.log("Node Timeout reset to " + timeout)
      this.timer = setTimeout(this.triggerTimeout.bind(this), timeout );
    }
    else {
      this.timer = setTimeout( this.resetTimer.bind(this), this.getRandomFollowerTimeout())
    }

  }

  triggerTimeout(){
    if( this.position == "follower" ){
      this.changePositionTo("candidate");
    }
    else if( this.position == "candidate" ){
      this.changePositionTo("candidate");
    }

    this.resetTimer();
  }

  cancelRequestVoteBroadcast(){
    for( let i = 0; i < this.candidateRequestVotes.length; ++ i )
      this.candidateRequestVotes[i].cancel()

    this.candidateRequestVotes.length = 0
  }

  broadcastRequestVote(){
    let positiveCount = 1
    let negativeCount = 0
    const majority = Math.ceil( this.config.node_addresses.length/2) // -1 for counting himself
    const node = this


    for( let i = 0; i < this.config.node_addresses.length; ++ i ){
      if( i == this.nodeId ) continue;
      this.candidateRequestVotes.push(
        this.sendRequestVote(i).then(()=>{
          positiveCount++
          debug.log( "Pos" + positiveCount )
          if( positiveCount >= majority ){
            this.cancelRequestVoteBroadcast()
            this.changePositionTo("leader")
          }
        }).catch(()=>{
          negativeCount++
          debug.log( "Neg " + negativeCount )
          if( negativeCount >= majority )
            this.cancelRequestVoteBroadcast()
        })
      );
    }
  }

  changePositionTo(newPos){
    try {
      if( this.position == "follower" && newPos == "leader" )
        throw new Error("A bug is detected");
      if( this.position == "leader" && newPos == "candidate" )
        throw new Error("A bug is detected");

      debug.log("Node change position from " + this.position +  " to " +newPos);
      this.resetTimer();

      if( this.position == "leader" && newPos == "follower" ){
        // pasti jd follower lagi
        // re init timeout
        for( let i = 0; i < this.childTimer.length; ++ i ){
          clearTimeout( this.childTimer[i] )
        }
      }

      if( this.position == "candidate" && newPos == "leader" ){
        // disable timer
        clearTimeout(this.timer)

        // init leader's variable
        this.nextIndex = []
        this.matchIndex = []
        let lastLogIndex = this.state.logs.length-1
        for( let i = 0; i < this.config.node_addresses.length; ++ i ){
          if( i == this.nodeId ){
            this.nextIndex[i] = lastLogIndex + 1
            this.matchIndex[i] = lastLogIndex
            continue;
          }

          this.nextIndex[i] = lastLogIndex + 1
          this.matchIndex[i] = 0
          this.childTimer[i] = setTimeout( this.sendAppendLog.bind(this, i), this.getHeartbeatTimeout());
        }
      }

      if( this.position == "candidate" )
        this.cancelRequestVoteBroadcast()

      if( newPos == "candidate" ){
        this.state.currentTerm ++;
        this.state.votedFor = this.nodeId
        // broadcast asking for an election
        this.broadcastRequestVote()
      }

      this.position = newPos;
    }
    catch(err){
      debug.log(err)
    }
  }

    // if candidate - candidate an election have failed
    // - split vote happened or
    // - majority of server is down
    // - network partition happened
    // re elect and re broadcast


  // -- timeout related ends

  updateCommitIndex(){
    // check if can increase commitedIndex
    let majority = Math.ceil( this.config.node_addresses.length/2)

    let cidx = this.state.commitedIndex
    for(;;){
      let res = this.matchIndex.filter( (i) => i > cidx );
      // + 1 because leader is counted too
      if( res.length < majority )
        break;
      cidx = Math.min.apply(null, res)
    }

    let currentData = this.state.currentData
    for( let i = this.state.commitedIndex + 1; i <= cidx; ++ i ){
      currentData = Object.assign( currentData, this.state.logs[i].data );
    }

    this.state.commitedIndex = cidx
    this.state.currentData = currentData
    this.writeState()
  }

  sendAppendLog( to ){
    if( this.position != "leader" ){
      debug.log("BUG : still sending after not a leader")
      return;
    }
    let appendEntriesRPC = new AppendEntriesRPC( this, to );
    let node = this;

    return rp({
      method : "POST",
      uri : this.config.node_addresses[to] + "/load_balancer/receiveAppendLog",
      body : appendEntriesRPC,
      json : true
    }).then(function(response){
      let res = response;

      debug.log( appendEntriesRPC.entry)
      debug.log(res)
      if( res.type == "negative" ){
        node.nextIndex[to] --; // move back and try again
      }
      else if( res.type == "positive" ){
        if( appendEntriesRPC.entry != null ){ // sending something
          node.matchIndex[to] = appendEntriesRPC.prevLogIndex + 1;
          node.nextIndex[to] = appendEntriesRPC.prevLogIndex + 2;
          debug.log("Follower #"+to+" success append for " + appendEntriesRPC.prevLogIndex+1)
          node.updateCommitIndex();
        }
        else {
          if(
            node.nextIndex[to] != appendEntriesRPC.prevLogIndex + 1 ||
            node.matchIndex[to] != appendEntriesRPC.prevLogIndex
          ){
            node.updateCommitIndex()
          }
        }
      }
    }).catch(function(err){
      if(! err  )
        debug.log(err);
    }).finally(function(){
      node.childTimer[to] = setTimeout( node.sendAppendLog.bind(node, to), node.getHeartbeatTimeout() );
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
      if( response.term > node.state.currentTerm ){
        this.state.currentTerm = response.term;
        this.writeState();
        this.changePositionTo("follower");
        return Promise.reject();
      }

      if( response.type == "negative" )
        return Promise.reject()
      return Promise.resolve()
    }).catch(function(err){
      debug.log(err.message)
      return Promise.reject();
    })
  }

  receiveRequestVote( requestVoteRPC ){
    this.resetTimer();

    try {
      // kalau higher pasti itu aneh
      if( this.state.currentTerm > requestVoteRPC.term ){
        return this.replyNegative("candidate term is lower");
      }
      else if( this.state.currentTerm == requestVoteRPC.term ){
        if( this.state.votedFor == requestVoteRPC.candidateId )
          // candidate request vote 2x perhaps it doesn't
          return this.replyPositive("candidate resend requestVote");
        else
          // 2 candidate timeout bareng jd udah vote intinya
          return this.replyNegative("already voted for this term");
      }
      else { // currentTerm < request.term
        let maxLogIndexReceived = this.state.logs.length-1;

        // This node have more log than you, so you can't be leader
        if( maxLogIndexReceived > requestVoteRPC.lastLogIndex ){
          this.state.currentTerm = requestVoteRPC.term
          this.state.votedFor = null // ????
          this.changePositionTo("follower");
          return this.replyNegative("candidate log is not at least update with this node log");
        }

        this.state.votedFor = requestVoteRPC.candidateId
        this.state.currentTerm = requestVoteRPC.term
        this.changePositionTo("follower");
        return this.replyPositive();
      }
    }
    catch(err){
      debug.log( err.message )
      return Promise.reject(err);
    }
  }

  // comming from client
  receiveNewLog( data ){
    if( this.position == "leader" ){
      const maxLogIdx = this.state.logs.length - 1
      if( maxLogIdx == -1 ) maxLogIdx = 0
      const log = new Log( maxLogIdx + 1, this.state.currentTerm, data)
      this.state.logs.push( log )
      this.writeState()
      this.nextIndex[this.nodeId] = maxLogIdx + 1
      this.matchIndex[this.nodeId] = maxLogIdx + 2

      return Promise.resolve()
    }
    else {
      return Promise.reject(new Error("This node is not the leader this node is a " + this.position))
    }
  }

  receiveAppendLog( appendEntriesRPC ){
    try {
      this.resetTimer();

      appendEntriesRPC.__proto__ = appendEntriesRPC.prototype;
      let maxLogIndexReceived = this.state.logs.length-1;

      // new leader appear for some reason
      if( appendEntriesRPC.term > this.state.currentTerm ){
        this.state.votedFor = appendEntriesRPC.leaderId;
        this.state.currentTerm = appendEntriesRPC.term;
        this.writeState();
        this.changePositionTo("follower");
      }

      // -- stale leader
      if( appendEntriesRPC.term < this.state.currentTerm ){
        return this.replyNegative("stale leader sending appendEntries");
      }

      // -- log inconsistency


      // leader send beyond current log
      else if( appendEntriesRPC.prevLogIndex > maxLogIndexReceived ){
        return this.replyNegative("leader sending log too much beyond this node log");
      }
      // leader send inconsistent log
      else if( appendEntriesRPC.prevLogIndex >= 1 && this.state.logs[appendEntriesRPC.prevLogIndex].term != appendEntriesRPC.prevLogTerm ){
        return this.replyNegative("log inconsistency");
      }
      // -- normal case
      else {
        return this.processEntries( appendEntriesRPC ).then( this.replyPositive.bind(this) );
      }
    }
    catch(err){
      debug.log(err)
      return this.replyNegative(err.message)
    }
  }

  processEntries( appendEntriesRPC ){
    // append entry if not null
    if( appendEntriesRPC.entry != null )
      this.state.logs[appendEntriesRPC.entry.logId] = appendEntriesRPC.entry;

    // commit if not commited
    let currentData = this.state.currentData;
    let Limit = Math.min( this.state.logs.length-1, appendEntriesRPC.commitedIndex );

    // applying commited log to state machine
    for( let i = this.state.commitedIndex + 1; i <= Limit; ++ i ){
      currentData = Object.assign( currentData, this.state.logs[i].data );
    }

    this.state.currentData = currentData

    this.state.commitedIndex = Limit;

    // write to non volatile media
    this.writeState(); // synchronous

    return Promise.resolve();
  }

  getMaxLogIndex(){
    return this.states.length-1
  }

  replyPositive(message){
    return Promise.resolve({
      type : 'positive',
      term : this.state.currentTerm,
      message
    });
  }

  replyNegative(message){
    return Promise.resolve({
      type : 'negative',
      term : this.state.currentTerm,
      message
    })
  }

  writeState(){
    const fileloc = this.config.storage_location
    const filelocWrite = fileloc + ".tmp"
    if( fs.existsSync(filelocWrite) ){
      fs.unlinkSync(filelocWrite)
    }

    fs.writeFileSync( filelocWrite, JSON.stringify(this.state), 'utf8');

    if( fs.existsSync(fileloc) )
      fs.unlinkSync(fileloc)

    fs.renameSync(filelocWrite, fileloc)
  }

  readState(){
    let fileloc = this.config.storage_location;
    let filelocWrite = fileloc + ".tmp"
    const __default = {
      currentTerm : 1,
      logs : [{ logId : 0, data : {}, term : 0}], // starts with index 1
      commitedIndex : 0,
      lastApplied : 0,
      votedFor : null,
      currentData : {} // state machine
    };
    debug.log(fileloc);
    debug.log(filelocWrite);
    let tmpExist = fs.existsSync(filelocWrite)
    let stateExist = fs.existsSync(fileloc)
    if( tmpExist && !stateExist )
      fileloc = filelocWrite // when exiting renaming is not completed yet

    if( !tmpExist && !stateExist ){
      debug.log("Fail to read");
      return __default;
    }

    try {
      let data = fs.readFileSync( fileloc, 'utf8');
      return JSON.parse(data);
    }
    catch(err){
      debug.log("Format Err Fail to read");
      return __default;
    }
  }
}


class AppendEntriesRPC {
  constructor(leaderNode, targetIdx){
    let node = leaderNode
    let maxLogIndex = node.state.logs.length-1
    this.term = node.state.currentTerm
    this.leaderId = node.nodeId
    this.prevLogIndex = node.nextIndex[targetIdx]-1
    if( this.prevLogIndex >= 0 )
      this.prevLogTerm = node.state.logs[this.prevLogIndex].term
    if( this.prevLogIndex + 1 > maxLogIndex ) // heartbeat
      this.entry = null;
    else
      this.entry = node.state.logs[this.prevLogIndex+1];
    this.commitedIndex = node.state.commitedIndex;
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
  constructor(idx, term, data){
    this.logId = idx
    this.term = term
    this.data = data
    // this.data = { workerId, cpuload }
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
