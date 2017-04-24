let fs = require('fs');

class StateMachine {
  constructor(){
    this.state = {};
  }
  apply( log ){
    this.state = Object.assign( this.state, log );
  }
}


class Node {
  constructor(config, node_id){
    this.config = config;

    this.state = this.readState();

    // volatile state
    this.commitIndex = 0; // index of highest log entry known to be commited
    this.lastApplied = 0; // index of highest log entry applied to state machine

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
      votedFor : null,
      logs : [],
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

  appendLog( appendEntriesRPC ){

  }
}


module.exports = {
  Node : Node,
};
