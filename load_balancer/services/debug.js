"use strict";

let config = require('../config.js')

var fs = require('fs');
var util = require('util');
var log_file = fs.createWriteStream( config.log_location, {flags : 'w'});
var log_stdout = process.stdout;

let log = function(d) { //
  log_file.write(util.format(d) + '\n');
  log_stdout.write(util.format(d) + '\n');
};

module.exports = { log }
