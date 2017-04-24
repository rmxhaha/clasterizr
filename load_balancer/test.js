const config = require('./config');
let con = require('./services/consensus');
let p = new con.Node(config, 3);
p.writeState();
p.readState();

console.log(p.state);
