/*
 * MMOServer.js
 * A skeleton server for massively multiplayer space battle.
 * Assignment 3 for CS4344, AY2013/14.
 *
 * Usage: 
 *   node MMOServer.js
 */

"use strict"; 

var LIB_PATH = "./";
require(LIB_PATH + "Config.js");
require(LIB_PATH + "Ship.js");
require(LIB_PATH + "Rocket.js");
require(LIB_PATH + "Player.js");
require(LIB_PATH + "Cell.js");

function MMOServer() {
    // private Variables
    var nextPID = 0;  // PID to assign to next connected player 
    var ships = {};   // Associative array for ships, indexed via player ID
    var rockets = {}; // Associative array for rockets, indexed via timestamp
    var sockets = {}; // Associative array for sockets, indexed via player ID
    var players = {}; // Associative array for players, indexed via socket ID
    
    // private constants for Area-of-Interest management
    var AOI_WIDTH_SHIP = 100;   // The AOI width of the ships (AOI will be a cross)
    var AOI_LENGTH_SHIP = 500;  // The AOI length of the ships (AOI will not be an infinite cross)
    var AOI_RADIUS_ROCKET = 12;  // The AOI radius of a rocket to check for collision
    var CELL_WIDTH = AOI_WIDTH_SHIP/2;
    var CELL_HEIGHT = CELL_WIDTH;
    
    // private variables for Area-of-Interest management
    var cells = []; // The cells (2d array) for Interest Management
    var isCellsInitialized = false;
    var shipsCurrentCellRC = {}; // Associative array of the cell (r, c) which the ship is currently in, indexed by the playerId
    var rocketsCurrentCellRC = {}; // Associative array of the cell (r, c) which the rocket is currently in, indexed by the rocketId
    var shipsCurrentSubscribedCellsRC = {}; // Associative array of the cells (r, c) which the ship is currently subscribed to, indexed by the playerId   
    var rocketsSeenByShips = {}; // Associative array of the rockets seen by ships, indexed by playerId
    
    // private methods for Area-of-Interest management
    
    /*
     * Private method: checkCellsInitialized(callerName)
     *
     * Error checking method that checks if cells are initialized based on empty or not check.
     * Prints an error message including the callerName and returns false if not.
     */
    var checkCellsInitialized = function(callerName) {
      if (typeof cells === 'undefined') {
        console.log("Error in " + callerName + " - checkCellsInitialized(): cells is undefined");
        return false;
      }
      if (cells.length <= 0 || cells[0].length < 0) {
        console.log("Error in " + callerName + " - checkCellsInitialized(): cells is empty");
        return false;
      }
      return true;
    }
    
    /*
     * Private method: checkGoodCell(r, c, callerName)
     *
     * Error checking method that checks if the specified (r, c) cell indices 
     * are valid or not based on whether they exist in the cells array.
     * Prints an error message including the callerName and returns false if not.
     */
    var checkGoodCell = function(r, c, callerName) {
      if ( !checkCellsInitialized(callerName + " - checkGoodCell()")) {
        return false;
      }
      if (typeof r === 'undefined') {
        console.log("Error in " + callerName + " - checkGoodCell(): r is undefined");
        return false;
      } else if (typeof c === 'undefined') {
        console.log("Error in " + callerName + " - checkGoodCell(): c is undefined");
        return false;
      }
      
      // Check if it is an existing cell
      if (r < 0 || r >= cells.length || c < 0 || c >= cells[0].length) {
        console.log("Error in " + callerName + " - checkGoodCell(): cell (" + 
                      r + "," + c + ") is not a valid cell - maximum r = " + 
                      (cells.length-1) + ", c = " + (cells[0].length-1));
        return false;
      }
      return true;
    }
    
    /*
     * Private method: locateCellRC(x, y)
     *
     * Finds the cell that contains the point (x, y) and
     * returns the coordinates {r, c}
     */
    var locateCellRC = function(x, y) {      
      // Calculate the (r, c) coordinate for the cell
      var r = Math.floor(y/CELL_HEIGHT);
      var c = Math.floor(x/CELL_WIDTH);
      
      if ( !checkGoodCell(r, c, "locateCellRC()")) {
        return;
      }
      
      return {r: r, c: c};
    }

    /*
     * Private method: getCell(r, c)
     *
     * Returns a reference to the cell specified by indices (r, c)
     */
    var getCell = function(r, c) {
      if ( !checkGoodCell(r, c, "getCell()")) {
        return;
      }
      
      return cells[r][c];
    }
    
    /*
     * Private method: getCellsForCircleAOI(x, y, radius)
     *
     * Returns an array of cells which the circle AOI defined by (x, y, radius) intersects and contains
     */
    var getCellsForCircleAOI = function(x, y, radius) {
      var cellsToRet = [];
      var minR, maxR, minC, maxC;
      minR = minC = 1000000009;
      maxR = maxC = -1;
      var n = 8;
      for (var i = 0; i <= n; i++) {
        var newX = x + radius * Math.cos(i * 2 * Math.PI / n);
        var newY = y + radius * Math.sin(i * 2 * Math.PI / n);
        var r = Math.floor(newY/CELL_HEIGHT);
        var c = Math.floor(newX/CELL_WIDTH);
        if (r < 0 || r >= cells.length || c < 0 || c >= cells[0].length) {
          continue;
        }
        minR = Math.min(minR, r);
        minC = Math.min(minC, c);
        maxR = Math.max(maxR, r);
        maxC = Math.max(maxC, c);
      }
      minR = Math.max(0, minR);
      minC = Math.max(0, minC);
      maxR = Math.min(cells.length, maxR);
      maxC = Math.min(cells[0].length, maxC);
      for (var r = minR; r <= maxR; r++) {
        for (var c = minC; c <= maxC; c++) {
          cellsToRet.push(getCell(r, c));
        }
      }
      return cellsToRet;
    }
    
    /*
     * Private method: getCellsForCrossAOI(x, y, width, length)
     *
     * Returns an array of cells which the cross AOI defined by (x, y, width, length) intersects and contains
     */
    var getCellsForCrossAOI = function(x, y, width, length) {
      var cellsToRet = [];
      // Get the topR, bottomR, leftC, rightC of the middle square surrounding (x, y)
      var topR = Math.floor((y-width/2)/CELL_WIDTH); topR = Math.max(0, topR);
      var bottomR = Math.floor((y+width/2)/CELL_WIDTH); bottomR = Math.min(cells.length-1, bottomR);
      var leftC = Math.floor((x-width/2)/CELL_WIDTH); leftC = Math.max(0, leftC);
      var rightC = Math.floor((x+width/2)/CELL_WIDTH); rightC = Math.min(cells[0].length-1, rightC);
      //console.log("topR " + topR + " bottomR " + bottomR + " leftC " + leftC + " rightC " + rightC);
      
      // Find cells that intersect the horizontal rectangle
      var newTopR = topR; newTopR = Math.max(0, newTopR);
      var newBottomR = bottomR; newBottomR = Math.min(cells.length-1, newBottomR);
      var newLeftC = Math.floor((x-length/2)/CELL_WIDTH); newLeftC = Math.max(0, newLeftC);
      var newRightC = Math.floor((x+length/2)/CELL_WIDTH); newRightC = Math.min(cells[0].length-1, newRightC);
      //console.log("newTopR " + newTopR + " newBottomR " + newBottomR + " newLeftC " + newLeftC + " newRightC " + newRightC);
      for (var r = newTopR; r <= newBottomR; r++) {
        for (var c = newLeftC; c <= newRightC; c++) {
          cellsToRet.push(getCell(r, c));
        }
      }
      
      // Find cells that intersect the top part of the vertical rectangle
      newTopR = Math.floor((y-length/2)/CELL_WIDTH); newTopR = Math.max(0, newTopR);
      newBottomR = topR - 1; newBottomR = Math.min(cells.length-1, newBottomR);
      newLeftC = leftC; newLeftC = Math.max(0, newLeftC);
      newRightC = rightC; newRightC = Math.min(cells[0].length-1, newRightC);
      for (var r = newTopR; r <= newBottomR; r++) {
        for (var c = newLeftC; c <= newRightC; c++) {
          cellsToRet.push(getCell(r, c));
        }
      }
      
      // Find cells that intersect the bottom part of the vertical rectangle
      newTopR = bottomR + 1; newTopR = Math.max(0, newTopR);
      newBottomR = Math.floor((y+length/2)/CELL_WIDTH); newBottomR = Math.min(cells.length-1, newBottomR);
      newLeftC = leftC; newLeftC = Math.max(0, newLeftC);
      newRightC = rightC; newRightC = Math.min(cells[0].length-1, newRightC);
      for (var r = newTopR; r <= newBottomR; r++) {
        for (var c = newLeftC; c <= newRightC; c++) {
          cellsToRet.push(getCell(r, c));
        }
      }
      
      return cellsToRet;
    }
    
    /*
     * Private method: subscribeShip(shipId)
     * 
     * Subscribes the ship into all the cells it is interested in
     */
    var subscribeShip = function(shipId) {
      var s = ships[shipId];
      var cells = getCellsForCrossAOI(s.x, s.y, AOI_WIDTH_SHIP, AOI_LENGTH_SHIP);
      if ( !shipsCurrentSubscribedCellsRC[shipId]) {
        shipsCurrentSubscribedCellsRC[shipId] = [];
      }
      var subscribedCellsRC = shipsCurrentSubscribedCellsRC[shipId];
      var i;
      for (i in cells) {
        cells[i].subscribeShip(shipId);
        var r = Math.floor(cells[i].y/CELL_HEIGHT);
        var c = Math.floor(cells[i].x/CELL_WIDTH);
        subscribedCellsRC.push({r: r, c: c});
        //console.log("Subscribing ship " + shipId + " to cell (" + r + "," + c + ")");
      }
    }
    
    /*
     * Private method: unsubscribeShip(shipId) 
     * 
     * Unsubscribes the ship from all the cells it is currently subscribed to
     */
    var unsubscribeShip = function(shipId) {
      var subscribedCellsRC = shipsCurrentSubscribedCellsRC[shipId];
      var i;
      for (i in subscribedCellsRC) {
        var cellRC = subscribedCellsRC[i];
        var cell = getCell(cellRC.r, cellRC.c);
        cell.unsubscribeShip(shipId);
        var r = Math.floor(cell.y/CELL_HEIGHT);
        var c = Math.floor(cell.x/CELL_WIDTH);
        //console.log("Unsubscribing ship " + shipId + " from cell (" + r + "," + c + ")");
      }
      shipsCurrentSubscribedCellsRC[shipId] = [];
    }
    
    /*
     * Private method: insertShipIntoCell(shipId, r, c)
     *
     * Inserts (subscribes) the ship into the cell specified by indices (r, c) 
     * and subscribes it to all the cells it is interested in
     */
    var insertShipIntoCell = function(shipId, r, c) {   
      subscribeShip(shipId);
      shipsCurrentCellRC[shipId] = {r: r, c: c};
      //console.log("Ship went into new cell (" + r + "," + c + ")");
    }
    
    /*
     * Private method: insertRocketIntoCell(shipId, r, c)
     *
     * Inserts (subscribes) the rocket into the cell specified by indices (r, c) 
     * and subscribes it to all the cells it is interested in
     */
    var insertRocketIntoCell = function(rocketId, r, c) {    
      rocketsCurrentCellRC[rocketId] = {r: r, c: c};
      //console.log("Rocket went into new cell (" + r + "," + c + ")");
    }
    
    /*
     * Private method: removeShipFromCell(shipId)
     *
     * Unsubscribes the ship from all its currently subscribed cells
     */
    var removeShipFromCell = function(shipId) {
      var cell = getShipCell(shipId);
      unsubscribeShip(shipId);
      delete shipsCurrentCellRC[shipId];
      var r = Math.floor(cell.y/CELL_HEIGHT);
      var c = Math.floor(cell.x/CELL_WIDTH);
      //console.log("Ship removed from cell (" + r + "," + c + ")");
    }
    
    /*
     * Private method: removeRocketFromCell(rocketId)
     *
     * Removes the rocket from the cell
     */
    var removeRocketFromCell = function(rocketId) {
      delete rocketsCurrentCellRC[rocketId];
    }
    
    /*
     * Private method: locateCellRCAndInsertShip(shipId, x, y)
     *
     * Convenience method that combines locateCellRC(x, y) and insertShipIntoCell(shipId, r, c) into one.
     */
    var findCellAndInsertShip = function(shipId, x, y) {
      var cellRC = locateCellRC(x, y);
      insertShipIntoCell(shipId, cellRC.r, cellRC.c);
    }
    
    /*
     * Private method: locateCellRCAndInsertRocket(rocketId, x, y)
     *
     * Convenience method that combines locateCellRC(x, y) and insertRocketIntoCell(rocketId, r, c) into one.
     */
    var findCellAndInsertRocket = function(rocketId, x, y) {
      var cellRC = locateCellRC(x, y);
      var r = cellRC.r;
      var c = cellRC.c;
      insertRocketIntoCell(rocketId, r, c);
      //console.log("Rocket inserted into cell (" + r + "," + c + ")");
    }
    
    /*
     * Private method: getShipCellRC(shipId)
     *
     * Returns the ship's cell as of the last update
     */
    var getShipCellRC = function(shipId) {
      if (typeof shipId === 'undefined') {
        console.log("Error in getShipCellRC(): shipId is undefined");
        return;
      }
      
      return shipsCurrentCellRC[shipId];
    }
    
    /*
     * Private method: getShipCell(shipId)
     *
     * Returns the ship's cell as of the last update
     */
    var getShipCell = function(shipId) {
      if (typeof shipId === 'undefined') {
        console.log("Error in getShipCell(): shipId is undefined");
        return;
      }
      
      var shipCellRC = getShipCellRC(shipId);
      var shipCell = getCell(shipCellRC.r, shipCellRC.c);
      return shipCell;
    }
    
    /*
     * Private method: getRocketCellRC(rocketId)
     *
     * Returns the rocket's cell as of the last update
     */
    var getRocketCellRC = function(rocketId) {
      if (typeof rocketId === 'undefined') {
        console.log("Error in getRocketCellRC(): rocketId is undefined");
        return;
      }
      
      return rocketsCurrentCellRC[rocketId];
    }
    
    /*
     * Private method: getRocketCell(rocketId)
     *
     * Returns the rocket's cell as of the last update
     */
    var getRocketCell = function(rocketId) {
      if (typeof rocketId === 'undefined') {
        console.log("Error in getRocketCell(): rocketId is undefined");
        return;
      }
      
      var rocketCellRC = getRocketCellRC(rocketId);
      var rocketCell = getCell(rocketCellRC.r, rocketCellRC.c);
      return rocketCell;
    }
    
    /*
     * Private method: checkShipChangedCell(shipId, x, y)
     *
     * Checks if a ship has changed to a different cell.
     */
    var checkShipChangedCell = function(shipId, x, y) {
      var cellRC = locateCellRC(x, y);
      var newCell = getCell(cellRC.r, cellRC.c);
      var prevCell = getShipCell(shipId);
      if (typeof prevCell === 'undefined') {
        return true;
      }
      return (newCell.x != prevCell.x || newCell.y != prevCell.y);
    }
    
    /*
     * Private method: checkRocketChangedCell(shipId, x, y)
     *
     * Checks if a rocket has changed to a different cell.
     */
    var checkRocketChangedCell = function(rocketId, x, y) {
      var cellRC = locateCellRC(x, y);
      var newCell = getCell(cellRC.r, cellRC.c);
      var prevCell = getRocketCell(rocketId);
      if (typeof prevCell === 'undefined') {
        return true;
      }
      return (newCell.x != prevCell.x || newCell.y != prevCell.y);
    }
    
    /*
     * Private method: updateShipCell(shipId, x, y)
     *
     * Updates a ship's cell if the given (x, y) moves it into a cell different from its previous one.
     */
    var updateShipCell = function(shipId, x, y) {
      if (checkShipChangedCell(shipId, x, y)) {
        removeShipFromCell(shipId);
        findCellAndInsertShip(shipId, x, y);
        // AOI: Send the turn event only to people subscribed to the cell
        var cell = getShipCell(shipId);
        var shipsSubscribed = cell.getShips();
        delete shipsSubscribed[shipId]; // don't send back
        broadcastSelectively(shipsSubscribed, {
          type:"turn",
          id: shipId,
          x: ships[shipId].x,
          y: ships[shipId].y,
          dir: ships[shipId].dir
        });
      }
    }
    
    /*
     * Private method: updateRocketCell(rocketId, x, y)
     *
     * Updates a rocket's cell if the given (x, y) moves it into a cell different from its previous one.
     * Updates the corresponding interested parties (entities subscribed)
     */
    var updateRocketCell = function(rocketId, x, y) {
      if (checkRocketChangedCell(rocketId, x, y)) {
        removeRocketFromCell(rocketId);
        findCellAndInsertRocket(rocketId, x, y);
        // AOI: Send the rocket fire event only to people subscribed to the cell AND who have not seen the rocket already
        var cell = getRocketCell(rocketId);
        var shipsSubscribed = cell.getShips();
        for (var i in shipsSubscribed) {
          rocketsSeenByShips[i] = rocketsSeenByShips[i] || {};
          var rocketsSeen = rocketsSeenByShips[i];
          if ( !rocketsSeen[rocketId]) {
            rocketsSeen[rocketId] = rocketId;
          } else {
            delete shipsSubscribed[i];
          }
        }
        var rocket = rockets[rocketId];
        broadcastSelectively(shipsSubscribed, {
            type:"fire",
            ship: rocket.from,
            rocket: rocketId,
            x: rocket.x,
            y: rocket.y,
            dir: rocket.dir
        });
      }
    }
    
    /*
     * private method: broadcastSelectively(players, msg)
     *
     * broadcast takes in a JSON structure and send it to
     * all players in the players array passed in.
     *
     * e.g., broadcast({1: 1, 2: 2}, {type: "abc", x: 30});
     */
    var broadcastSelectively = function(players, msg) {
      var id;
      for (id in players) {
        sockets[id].write(JSON.stringify(msg));
      }
    }
    
    /*
     * private method: broadcast(msg)
     *
     * broadcast takes in a JSON structure and send it to
     * all players.
     *
     * e.g., broadcast({type: "abc", x: 30});
     */
    var broadcast = function (msg) {
        var id;
        for (id in sockets) {
            sockets[id].write(JSON.stringify(msg));
        }
    }

    /*
     * private method: broadcastUnless(msg, id)
     *
     * broadcast takes in a JSON structure and send it to
     * all players, except player id
     *
     * e.g., broadcast({type: "abc", x: 30}, pid);
     */
    var broadcastUnless = function (msg, pid) {
        var id;
        for (id in sockets) {
            if (id != pid)
                sockets[id].write(JSON.stringify(msg));
        }
    }

    /*
     * private method: unicast(socket, msg)
     *
     * unicast takes in a socket and a JSON structure 
     * and send the message through the given socket.
     *
     * e.g., unicast(socket, {type: "abc", x: 30});
     */
    var unicast = function (socket, msg) {
        socket.write(JSON.stringify(msg));
    }

    /*
     * private method: newPlayer()
     *
     * Called when a new connection is detected.  
     * Create and init the new player.
     */
    var newPlayer = function (conn) {
        nextPID ++;
        // Create player object and insert into players with key = conn.id
        players[conn.id] = new Player();
        players[conn.id].pid = nextPID;
        sockets[nextPID] = conn;
    }

    /*
     * private method: gameLoop()
     *
     * The main game loop.  Called every interval at a
     * period roughly corresponding to the frame rate 
     * of the game
     */
    var gameLoop = function () {
        var i;
        var j;
        var k;
        for (i in ships) {
            ships[i].moveOneStep();
            // AOI: update ship cell if it goes to a new cell
            updateShipCell(i, ships[i].x, ships[i].y);
        }
        for (i in rockets) {
            rockets[i].moveOneStep();
            // remove out of bounds rocket
            if (rockets[i].x < 0 || rockets[i].x > Config.WIDTH ||
                rockets[i].y < 0 || rockets[i].y > Config.HEIGHT) {
                rockets[i] = null;
                delete rockets[i];
            } else {
                // AOI: update rocket cell if it goes to a new cell
                updateRocketCell(i, rockets[i].x, rockets[i].y);
                // AOI: check only the ships which are nearby!
                var nearbyCells = getCellsForCircleAOI(rockets[i].x, rockets[i].y, AOI_RADIUS_ROCKET);
                // For each ship, checks if this rocket has hit the ship
                // A rocket cannot hit its own ship.
                for (k in nearbyCells) {
                  var subscribedShips = nearbyCells[k].getShips();
                  for (j in subscribedShips) {
                      if (rockets[i] != undefined && rockets[i].from != j) {
                          //console.log("Checking collision with ship " + j);
                          if (rockets[i].hasHit(ships[subscribedShips[j]])) {
                              // tell only the shooter and the shot
                              var shooter = rockets[i].from;
                              unicast(sockets[shooter], {type:"hit", rocket: i, ship: j});
                              unicast(sockets[j], {type:"hit", rocket: i, ship: j});
                              delete rockets[i];
                              //console.log("Rocket from " + shooter + " hit " + j);
                          }
                      } 
                  }
                }
            }
        }
    }

    /*
     * priviledge method: start()
     *
     * Called when the server starts running.  Open the
     * socket and listen for connections.  Also initialize
     * callbacks for socket.
     */
    this.start = function () {
        try {
            var express = require('express');
            var http = require('http');
            var sockjs = require('sockjs');
            var sock = sockjs.createServer();

            var numRows = Config.HEIGHT / CELL_WIDTH;
            var numColumns = Config.WIDTH / CELL_WIDTH;

            //initialise 2d array
            for (var i = 0; i < numRows+1; i++) {
                cells[i] = [];
            }

            //initialise cells
            for (var i = 0; i < numRows+1; i++) {
                for (var j = 0; j < numColumns+1; j++) {
                    var centerX = (j * CELL_WIDTH + CELL_WIDTH/2);
                    var centerY = (i * CELL_WIDTH + CELL_WIDTH/2);
                    cells[i][j] = new Cell();
                    cells[i][j].init(centerX, centerY, CELL_WIDTH, CELL_WIDTH);
                }
            }
            
            // set the flag
            isCellsInitialized = true;

            // Upon connection established from a client socket
            sock.on('connection', function (conn) {
                newPlayer(conn);

                // When the client closes the connection to the 
                // server/closes the window
                conn.on('close', function () {
                    var pid = players[conn.id].pid;
                    delete ships[pid];
                    delete players[conn.id];
                    broadcastUnless({
                        type: "delete", 
                        id: pid}, pid)
                });

                // When the client send something to the server.
                conn.on('data', function (data) {
                    var message = JSON.parse(data)
                    var p = players[conn.id];
                    if (p === undefined) {
                        // we received data from a connection with
                        // no corresponding player.  don't do anything.
                        console.log("player at " + conn.id + " is invalid."); 
                        return;
                    } 
                    switch (message.type) {
                        case "join":
                            // A client has requested to join. 
                            // Initialize a ship at random position
                            // and tell everyone.
                            var pid = players[conn.id].pid;
                            var x = Math.floor(Math.random()*Config.WIDTH);
                            var y = Math.floor(Math.random()*Config.HEIGHT);
                            var dir;
                            var dice = Math.random();
                            // pick a dir with equal probability
                            if (dice < 0.25) {
                                dir = "right";
                            } else if (dice < 0.5) {
                                dir = "left";
                            } else if (dice < 0.75) {
                                dir = "up";
                            } else {
                                dir = "down";
                            }
                            ships[pid] = new Ship();
                            ships[pid].init(x, y, dir);
                            
                            // AOI: insert the new ship into its appropriate cell
                            findCellAndInsertShip(pid, x, y);
                            
                            broadcastUnless({
                                type: "new", 
                                id: pid, 
                                x: x,
                                y: y,
                                dir: dir}, pid)
                            unicast(sockets[pid], {
                                type: "join",
                                id: pid,
                                x: x,
                                y: y,
                                dir: dir});   
                            
                            // Tell this new guy who else is in the game.
                            for (var i in ships) {
                                if (i != pid) {
                                    if (ships[i] !== undefined) {
                                        unicast(sockets[pid], {
                                            type:"new",
                                            id: i, 
                                            x: ships[i].x, 
                                            y: ships[i].y, 
                                            dir: ships[i].dir});   
                                    }
                                }
                            }
                            break;

                        case "turn":
                            // A player has turned.  Tell everyone else.
                            var pid = players[conn.id].pid;
                            // AOI: Send the turn event only to people subscribed to the cell
                            var cell = getShipCell(pid);
                            var shipsSubscribed = cell.getShips();
                            delete shipsSubscribed[pid]; // don't send back
                            broadcastSelectively(shipsSubscribed, {
                              type:"turn",
                              id: pid,
                              x: message.x,
                              y: message.y,
                              dir: message.dir
                            });
                            
                            ships[pid].jumpTo(message.x, message.y);
                            ships[pid].turn(message.dir);
                            
                            break;

                        case "fire":
                            // A player has asked to fire a rocket.  Create
                            // a rocket, and tell everyone (including the player, 
                            // so that it knows the rocket ID).
                            var pid = players[conn.id].pid;
                            var r = new Rocket();
                            r.init(message.x, message.y, message.dir, pid);
                            var rocketId = new Date().getTime();
                            rockets[rocketId] = r;
                            
                            // AOI: insert the new rocket into its appropriate cell
                            findCellAndInsertRocket(rocketId, message.x, message.y);
                            // Send to the players subscribed to the cell
                            var rocketCell = getRocketCell(rocketId);
                            var subscribedShips = rocketCell.getShips();
                            for (var i in subscribedShips) {
                              rocketsSeenByShips[i] = rocketsSeenByShips[i] || {};
                              var rocketsSeen = rocketsSeenByShips[i];
                              if ( !rocketsSeen[rocketId]) {
                                rocketsSeen[rocketId] = rocketId;
                              } else {
                                delete subscribedShips[i];
                              }
                            }
                            broadcastSelectively(subscribedShips, {
                                type:"fire",
                                ship: r.from,
                                rocket: rocketId,
                                x: r.x,
                                y: r.y,
                                dir: r.dir
                            });
                            // Note that messages about rockets will only be sent to other players when they enter their AOI
                            break;
                            
                        default:
                            console.log("Unhandled " + message.type);
                    }
                }); // conn.on("data"
            }); // socket.on("connection"

            // cal the game loop
            setInterval(function() {gameLoop();}, 1000/Config.FRAME_RATE); 

            // Standard code to start the server and listen
            // for connection
            var app = express();
            var httpServer = http.createServer(app);
            sock.installHandlers(httpServer, {prefix:'/space'});
            httpServer.listen(Config.PORT, Config.SERVER_NAME);
            app.use(express.static(__dirname));
            console.log("Server running on http://" + Config.SERVER_NAME + 
                    ":" + Config.PORT + "\n")
            console.log("Visit http://" + Config.SERVER_NAME + ":" + Config.PORT + "/index.html in your browser to start the game")
        } catch (e) {
            console.log("Cannot listen to " + Config.PORT);
            console.log("Error: " + e);
        }
    }
}

// This will auto run after this script is loaded
var server = new MMOServer();
server.start();

// vim:ts=4:sw=4:expandtab
