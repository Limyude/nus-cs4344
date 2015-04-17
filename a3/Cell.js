/*
 * Cell.js
 * Implementation of a cell for Interest Management in Space Battle.
 * Assignment 3 for CS4344, AY2014/15.
 *
 * Usage: 
 *    require(LIB_PATH + "Cell.js");
 */

"use strict"; 
function Cell()
{
	// public:
  this.x; // center of the cell
  this.y; //
  this.w; // width of a cell
  this.h; // height of a cell
  
  // private:
  var ships = {};   // ships in the cell indexed by the player id
  var rockets = {}; // rockets in the cell indexed by the rocket id

	// constructor
	var that = this;
	this.init = function(xx, yy, ww, hh) {
    this.x = xx;
    this.y = yy;
		this.w = ww;
    this.h = hh;
	}
  
  // Subscribes a ship to the cell using the player id
  this.subscribeShip = function(playerId) {
    if (typeof playerId === 'undefined') {
      console.log("Error in Cell.subscribeShip(): playerId is undefined");
      return;
    }
    
    ships[playerId] = playerId;
  }
  
  // Subscribes a rocket to the cell using its id
  this.subscribeRocket = function(rocketId) {
    if (typeof rocketId === 'undefined') {
      console.log("Error in Cell.subscribeRocket(): rocketId is undefined");
      return;
    }
    
    rockets[rocketId] = rocketId;
  }
  
  // Unsubscribes a ship from the cell
  this.unsubscribeShip = function(playerId) {
    if (typeof playerId === 'undefined') {
      console.log("Error in Cell.unsubscribeShip(): playerId is undefined");
      return;
    } else if (typeof ships[playerId] === 'undefined') {
      //console.log("Error in Cell.unsubscribeShip(): playerId " + playerId + " is not found in the cell at (x,y):(" + this.x + "," + this.y + ")");
      return;
    }
    
    delete ships[playerId];
  }
  
  // Unsubscribes a rocket from the cell
  this.unsubscribeRocket = function(rocketId) {
    if (typeof rocketId === 'undefined') {
      console.log("Error in Cell.unsubscribeRocket(): rocketId is undefined");
      return;
    } else if (typeof rockets[rocketId] === 'undefined') {
      console.log("Error in Cell.unsubscribeRocket(): rocketId " + rocketId + " is not found in the cell at (" + this.x + "," + this.y + ")");
      return;
    }
    
    delete rockets[rocketId];
  }
  
  // Returns an associative array containing all ships subscribed to the cell
  this.getShips = function() {
    var clone = {};
    for (var i in ships) {
      clone[i] = ships[i];
    }
    return clone;
  }
  
  // Returns an associative array containing all rockets subscribed to the cell
  this.getRockets = function() {
    var clone = {};
    for (var i in rockets) {
      clone[i] = rockets[i];
    }
    return clone;
  }
  
  // Checks if a point (x,y) is in the cell
  this.pointInCell = function(x, y) {
    if (typeof x === 'undefined') {
      console.log("Error in Cell.pointInCell(): x is undefined");
      return;
    } else if (typeof y === 'undefined') {
      console.log("Error in Cell.pointInCell(): y is undefined");
      return;
    }
    
    // On the left or top borders = in the cell,
    // but on the right or bottom borders = out of the cell
    if (x >= (this.x - this.w/2) && x < (this.x + this.w/2) &&
      y >= (this.y - this.h/2) && y < (this.y + this.h/2)) {
      // In the cell!
      return true;
    } else {
      // Out of the cell!
      return false;
    }
  }
}

global.Cell = Cell;

// Dynamically define the getTimestamp() function depending on
// platform.
if (typeof window === "undefined") {
	var getTimestamp = function() { 
		var t = process.hrtime(); return t[0]*1e3 + t[1]*1.0/1e6
	} 
} else if (window.performance.now) {
	var getTimestamp = function() { 
		return window.performance.now(); 
	};
} else if (window.performance.webkitNow) {
    var getTimestamp = function() { 
		return window.performance.webkitNow(); 
	};
} else {
	var getTimestamp = function() { 
		return new Date().now(); 
	};
}

//vim:ts=4:sw=4:expandtab
