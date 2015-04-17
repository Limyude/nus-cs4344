/*
 * Client.js
 * Implementation of a non-Bot game client in Space Battle.
 * Assignment 3 for CS4344, AY2014/15.
 *
 * Usage in a HTML file: 
 *     <body onload="loadScript('', 'Client.js')"> 
 */
"use strict"; 

function Client() {
    var sock;          // socket to server
    var sock2;
    var ships = {};    // associative array of ships, indexed by ship ID
    var rockets = {};  // associative array of rockets, indexed by rocket ID
    var myShip;        // my ship object  (same as ships[myId])
    var myId;          // My ship ID
    
    var AOI_WIDTH = 100;
    var AOI_LENGTH = 300;

    var countMessagesRcv = 0;
    var countMessagesSent = 0;
    
    var shipLastUpdates = {}; // last update timestamp
    var TIME_LIMIT_BEFORE_FADE = 5000; // 5 seconds
    
    /*
     * private method: sendToServer(msg)
     *
     * The method takes in a JSON structure and send it
     * to the server, after converting the structure into
     * a string.
     */
    var sendToServer = function (msg) {
        showMessage("sent", ++countMessagesSent);
        console.log("send-> " + JSON.stringify(msg));
        sock.send(JSON.stringify(msg));
        //sock2.send(JSON.stringify(msg));
    }

    /*
     * priviledge method: run()
     *
     * The method is called to initialize and run the client.
     * It connects to the server via SockJS (so, run
     * "node MMOServer.js" first) and set up various 
     * callbacks.
     *
     */
    this.run = function() {
        sock = new SockJS('http://' + Config.SERVER_NAME + ':' + Config.PORT + '/space');
        sock.onmessage = function(e) {
        var message = JSON.parse(e.data);
            showMessage("received", ++countMessagesRcv);
            switch (message.type) {
                case "join": 
                    // Server agrees to let this client join.
                    myId = message.id;
                    shipLastUpdates[myId] = -9999999; // so that we don't display the ship at first until they come into our AOI and update us
                    ships[myId] = new Ship();
                    myShip = ships[myId];
                    myShip.init(message.x, message.y, message.dir);

                    // Start the game loop
                    setInterval(function() {gameLoop();}, 1000/Config.FRAME_RATE); 
                    break;
                case "new":
                    // Add a ship to the battlefield.
                    var id = message.id;
                    shipLastUpdates[id] = -9999999; // so that we don't display the ship at first until they come into our AOI and update us
                    ships[id] = new Ship();
                    ships[id].init(message.x, message.y, message.dir);
                    break;
                case "turn":
                    // Ship id just turned to dir at position (x,y)
                    var id = message.id;
                    shipLastUpdates[id] = getTimestamp();
                    console.log("turn received: timestamp: " + shipLastUpdates[id]);
                    if (ships[id] === undefined) {
                        console.log("turn error: undefined ship " + id);
                    } else {
                        // We do zero-order convergence for simplicity here.
                        ships[id].jumpTo(message.x, message.y);
                        ships[id].turn(message.dir);
                    }
                    break;
                case "fire":
                    // Ship sid just fired a rocket rid in dir 
                    // at position (x,y)
                    var sid = message.ship;
                    var rid = message.rocket;
                    if (ships[sid] === undefined) {
                        console.log("fire error: undefined ship " + sid);
                    } 
                    var r = new Rocket();
                    r.init(message.x, message.y, message.dir, sid);
                    rockets[rid] = r;
                    break;
                case "hit":
                    // Rocket rid just hit Ship sid
                    var sid = message.ship;
                    var rid = message.rocket;
                    if (ships[sid] === undefined) {
                        console.log("hit error: undefined ship " + sid);
                    } else {
                        // If this client has been hit, increase hit count
                        ships[sid].hit();
                        if (sid == myId) {
                            showMessage("hitCount", myShip.hitCount);
                        }
                    }
                    if (rockets[rid] === undefined) {
                        console.log("hit error: undefined rocket " + rid);
                    } else {
                        // If it is this client's rocket that hits, increase kill count
                        ships[rockets[rid].from].kill();
                        if (rockets[rid].from == myId) {
                            showMessage("killCount", myShip.killCount);
                        }
                        // Remove the rocket
                        delete rockets[rid];
                    }
                    break;
                case "delete":
                    // Ship ID has quit. Remove the ship from the battle.
                    var id = message.id;
                    if (ships[id] === undefined) {
                        console.log("delete error: undefined ship " + id);
                    } else {
                        delete ships[id];
                    }
                    break;
                default:
                    console.log("error: undefined command " + message.type);
            }
        };

        sock.onclose = function() {
            // Connection to server has closed.  Delete everything.
            for (var i in ships) {
                delete ships[i];
            }
            for (var i in rockets) {
                delete rockets[i];
            }
        }

        sock.onopen = function() {
            // When connection to server is open, ask to join.
            sendToServer({type:"join"});
        }

        // Setup the keyboard input.  User controls the game with
        // arrow keys and space bar.
        var c = document.getElementById("canvas");
        c.height = Config.HEIGHT;
        c.width= Config.WIDTH;

        document.addEventListener("keydown", function(e) {
            if (myShip === undefined) {
                // if myShip is not created yet (e.g., still
                // waiting for join permission from server), 
                // quitely returned.
                return;
            }
            // We short-circuit turn, but not fire.  
            if (e.keyCode == 37) { 
                myShip.turn("left");
                sendToServer({
                    type:"turn", 
                    x: myShip.x, 
                    y: myShip.y, 
                    dir:"left"});
            } else if (e.keyCode == 38) { 
                myShip.turn("up");
                sendToServer({
                    type:"turn", 
                    x: myShip.x, 
                    y: myShip.y, 
                    dir:"up"});
            } else if (e.keyCode == 39) {
                myShip.turn("right");
                sendToServer({
                    type:"turn", 
                    x: myShip.x, 
                    y: myShip.y, 
                    dir:"right"});
            } else if (e.keyCode == 40) {
                myShip.turn("down");
                sendToServer({
                    type:"turn", 
                    x: myShip.x, 
                    y: myShip.y, 
                    dir:"down"});
            } else if (e.keyCode == 32) { // space
                sendToServer({
                    type:"fire",
                    x: myShip.x, 
                    y: myShip.y, 
                    dir: myShip.dir});
            }
            if ((e.keyCode >= 37 && e.keyCode <= 40) || e.keyCode == 32) {
                e.preventDefault();
            }
        }, false);

    }

    /*
     * priviledge method: gameLoop()
     *
     * Calculate the movement of every ship and rocket.
     * Remove out-of-bound rocket, then render the whole
     * battle field.
     *
     */
    var gameLoop = function() {
        for (var i in ships) {
            ships[i].moveOneStep();
        }
        // remove out-of-bound rockets
        for (var i in rockets) {
            rockets[i].moveOneStep();
            if (rockets[i].x < 0 || rockets[i].x > Config.WIDTH ||
                rockets[i].y < 0 || rockets[i].y > Config.HEIGHT) {
                rockets[i] = null;
                delete rockets[i];
            }
        }
        render();
    }


    /*
     * priviledge method: render()
     *
     * Draw every ship and every rocket in the battlefield.
     *
     */
    var render = function() {
        // Get context
        var c = document.getElementById("canvas");
        var context = c.getContext("2d");

        // Clears the playArea
        context.clearRect(0, 0, Config.WIDTH, Config.HEIGHT);

        context.fillStyle = "#000000";
        context.fillRect(0, 0, Config.WIDTH, Config.HEIGHT);

        // Draw the ship
        for (var i in ships) {
            var curTime = getTimestamp();
            if (ships[i] !== myShip && (curTime - shipLastUpdates[i] > TIME_LIMIT_BEFORE_FADE)) {
              continue;
            }
            if (ships[i] === myShip) {
                ships[i].draw(context, true);
            } else {
                ships[i].draw(context, false);
            }
        }
        
        // Draw the rocket
        for (var i in rockets) {
            if (rockets[i].from == myId)
                rockets[i].draw(context, true);
            else
                rockets[i].draw(context, false);
        }

        //commented out for submission purposes.
        //drawCellsAndAOI(context);
    }


    //draw the player's AOI and the map cells
    var drawCellsAndAOI = function(context) {
        //draw the cells
        context.save();

        context.lineWidth = 1;
        for (var i = 0; i < 1000; i+=50) {
            context.beginPath();
            context.moveTo(i, 0);
            context.lineTo(i, 700);
            context.strokeStyle = 'white';
            context.stroke();
        }
        for (var i = 0; i < 700; i+=50) {
            context.beginPath();
            context.moveTo(0, i);
            context.lineTo(1000, i);
            context.strokeStyle = 'white';
            context.stroke();
        }

        context.lineWidth = 3;
        context.strokeStyle = 'hotpink';
        context.beginPath();

        //right vertical
        context.moveTo(myShip.x + AOI_WIDTH/2, myShip.y - AOI_LENGTH/2);
        context.lineTo(myShip.x + AOI_WIDTH/2, myShip.y + AOI_LENGTH/2);

        if (myShip.y - AOI_LENGTH/2 < 0) {
            context.moveTo(myShip.x + AOI_WIDTH/2, Config.HEIGHT);
            context.lineTo(myShip.x + AOI_WIDTH/2, Config.HEIGHT + myShip.y - AOI_LENGTH/2);
        }

        if (myShip.y + AOI_LENGTH/2 > Config.HEIGHT) {
            context.moveTo(myShip.x + AOI_WIDTH/2, 0);
            context.lineTo(myShip.x + AOI_WIDTH/2, myShip.y + AOI_LENGTH/2 - Config.HEIGHT);
        }

        //left vertical
        context.moveTo(myShip.x - AOI_WIDTH/2, myShip.y - AOI_LENGTH/2);
        context.lineTo(myShip.x - AOI_WIDTH/2, myShip.y + AOI_LENGTH/2);

        if (myShip.y - AOI_LENGTH/2 < 0) {
            context.moveTo(myShip.x - AOI_WIDTH/2, Config.HEIGHT);
            context.lineTo(myShip.x - AOI_WIDTH/2, Config.HEIGHT + myShip.y - AOI_LENGTH/2);
        }

        if (myShip.y + AOI_LENGTH/2 > Config.HEIGHT) {
            context.moveTo(myShip.x - AOI_WIDTH/2, 0);
            context.lineTo(myShip.x - AOI_WIDTH/2, myShip.y + AOI_LENGTH/2 - Config.HEIGHT);
        }

        //top horizontal
        context.moveTo(myShip.x - AOI_LENGTH/2, myShip.y + AOI_WIDTH/2);
        context.lineTo(myShip.x + AOI_LENGTH/2, myShip.y + AOI_WIDTH/2);

        if (myShip.x - AOI_LENGTH/2 < 0) {
            context.moveTo(Config.WIDTH, myShip.y + AOI_WIDTH/2);
            context.lineTo(Config.WIDTH + myShip.x - AOI_LENGTH/2, myShip.y + AOI_WIDTH/2);
        }

        if (myShip.x + AOI_LENGTH/2 > Config.WIDTH) {
            context.moveTo(0, myShip.y + AOI_WIDTH/2);
            context.lineTo(myShip.x + AOI_LENGTH/2 - Config.WIDTH, myShip.y + AOI_WIDTH/2);
        }

        //btm horizonal
        context.moveTo(myShip.x - AOI_LENGTH/2, myShip.y - AOI_WIDTH/2);
        context.lineTo(myShip.x + AOI_LENGTH/2, myShip.y - AOI_WIDTH/2);
        
        if (myShip.x - AOI_LENGTH/2 < 0) {
            context.moveTo(Config.WIDTH, myShip.y - AOI_WIDTH/2);
            context.lineTo(Config.WIDTH + myShip.x - AOI_LENGTH/2, myShip.y - AOI_WIDTH/2);
        }

        if (myShip.x + AOI_LENGTH/2 > Config.WIDTH) {
            context.moveTo(0, myShip.y - AOI_WIDTH/2);
            context.lineTo(myShip.x + AOI_LENGTH/2 - Config.WIDTH, myShip.y - AOI_WIDTH/2);
        }


        context.stroke();

        context.restore();
    }
    /*
     * private method: showMessage(location, msg)
     *
     * Display a text message on the web page.  The 
     * parameter location indicates the class ID of
     * the HTML element, and msg indicates the message.
     *
     * The new message replaces any existing message
     * being shown.
     */
    var showMessage = function(location, msg) {
        document.getElementById(location).innerHTML = msg; 
    }
}

var c = new Client();
c.run();

// vim:ts=4:sw=4:expandtab
