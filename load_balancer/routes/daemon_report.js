let express = require('express');
let router = express.Router();
let config = require('../config.json');

/* GET home page. */
router.get('/:worker_id/', function(req, res, next) {
  const worker_id = req.params.worker_id;
  const cpuload = req.query.cpuload;

  console.log( "Worker #" + worker_id + ": reporting CPU " + cpuload + "%" );

  res.json({
    'status' : 'ok',
    'message' : 'acknowledged'
  });
});

module.exports = router;
