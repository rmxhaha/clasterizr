let express = require('express');
let router = express.Router();
let config = require('../config.js');

/* GET home page. */
router.get('/:worker_id/', function(req, res, next) {
  const worker_id = req.params.worker_id;
  let cpuload = req.query.cpuload;

  if( cpuload > 100 )
    cpuload = 100;
  else if( cpuload < 0 )
    cpuload = 0;
  else {
    res.json({
      'status' : 'fail',
      'message' : 'cpuload not given'
    }, 422);
  }

  console.log( "Worker #" + worker_id + ": reporting CPU " + cpuload + "%" );

  res.json({
    'status' : 'ok',
    'message' : 'acknowledged'
  });
});

module.exports = router;
