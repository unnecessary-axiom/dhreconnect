// ==UserScript==
// @name            DH2 Reconnect
// @author          unnecessary-axiom
// @namespace       https://github.com/unnecessary-axiom/
// @description     Auto-reconnect Diamondhunt 2
// @license         MIT License
// @version	        0.1
// @match           https://*.diamondhunt.co/*
// @run-at          document-start
//
// @require         https://cdn.jsdelivr.net/gh/pladaria/reconnecting-websocket@4.1.9/dist/reconnecting-websocket-iife.min.js
// @require         https://cdn.jsdelivr.net/gh/AlexKvazos/VanillaToasts@1.3.0/vanillatoasts.js
// ==/UserScript==

// TODO: Give alert options, check if chat is even enabled


/*
 * Design
 * 
 * On login press game inits websocket, sends creds, receives result
 * On success game inits and plays.
 *
 * Before login press I replace websocket init code with a ReconnectingWebSocket
 * On login press I watch to keep track of which creds are used
 * Init game as normal on connection.
 * On disconnect, ReconnectingWS notifies me and I queue up re-auth for when it reconnects
 * Re-use whatever auth happened on first connection
 * Connection info happens in chat as a fake server messages unless chat isn't shown,
 * in which case I use toasters.
 *
 * Some wranging has to happen to show login return/connection messages in the right spot
 * As well as keeping track of when the initial connection and subsequent reconnections are done.
 *
 */

/*jshint esversion: 6 */
const r = (function(dh, toast, WS){
    'use strict';

    // did we login in for the first time
    let did_first_login = false;
    // have we queued the authentication request when re-connecting?
    let auth_queued = false;

    // the auth string sent when logging in with a preset
    let login_preset = null;
    // the password part of the un/pw pair is taken from the login pw box if present

    const debug = !! localStorage.dhreconnect_debug;
    const log = function(message){
        if(debug){
            console.log(`DHR> ${message}`);
        }
    };
    log('Loaded, debug mode ON');

    // TODO: Toast settings
    const message = function(text){
        log(`Sending message ${text}`);
        if(did_first_login && element_visible('div-chat')){
            // username, icon, tag, message, isServerMessage
            // but dhFixed uses it as isPM so we just to set it as 0
            // and use tag 5 for the 'SERVER MESSAGE' tag
            dh.addToChatBox('', 0, 5, `[DH Reconnect] ${text}`, 0);
        }else{
            toast.create({
                title: 'DH Reconnect',
                text: text,
                timeout: 10000,
            });
        }
    };

    // is element by id visible?
    const element_visible = function(e){
        return window.getComputedStyle(
            document.getElementById(e)
        ).display != 'none';
    };

    // override login functions to track method used
    // clear the login preset if a PW is used
    const _login = dh.login;
    dh.login = function(username, password, isNewAccount){
        login_preset = null;
        log('Saw PW login, clearing login preset');
        _login.apply(this, arguments);
    };

    // Store the preset used to log in
    const _loginPresets = dh.loginPresets;
    dh.loginPresets = function(presetData){
        login_preset = presetData;
        log('Saw preset login, keeping');
        _loginPresets.apply(this, arguments);
    };

    // Override the login result message to apply only if we aren't connected
    // If we are connected, use our own message system
    const _manageLoginReturnMessage = dh.manageLoginReturnMessage;
    dh.manageLoginReturnMessage = function(return_message){
        if(did_first_login){
            // Mute the Loading message on reconnect so we aren't spammy. There is nothing to load.
            if(return_message === 'Loading...'){
                return;
            }
            message(return_message);
        }else{
            _manageLoginReturnMessage.apply(this, arguments);
        }
    };

    // Override startGame to detect success on login
    const _startGame = dh.startGame;
    dh.startGame = function(){
        if(!did_first_login){
            did_first_login = true;
            // only run DH init on real first login
            _startGame.apply(this, arguments);
        } else {
            // after reconnected reconnected and loading message
            // message('Ready');
        }
        // we authenticated, free to auth next connection loss
        auth_queued = false;
    };

    // Override the websocket setup function and install the custom websocket
    dh.initWebsocket = function(){
        if (dh.webSocket){ return; }
        log('Setting up websocket');

        // https://github.com/pladaria/reconnecting-websocket
        dh.webSocket = new WS(dh.SSL_ENABLED, [], {
            debug: debug
        });

        dh.webSocket.addEventListener('open', function(event){
            // if this isn't set, cBytes won't send data
            dh.websocketReady = true;

            // this is set after the first connection, during authentication
            if(did_first_login){
                message('Reconnected!');
            }
        });

        dh.webSocket.addEventListener('message', function(event){
            dh.doCommand(event.data);
        });

        // override the disconnect event to queue the auth command as soon as possible
        // so we can apply as many queued events as possible
        dh.webSocket.addEventListener('close', function(event){
            if(auth_queued){
                log('connection closed again, but already sent auth');
                // we have an auth message already queued, don't send another
                return;
            }
            auth_queued = true;
            message('Connection lost, reconnecting...');

            if(login_preset){
                log('Logging in with preset');
                dh.cBytes('LOAD_PRESET=' + login_preset);
            }else if(
                document.getElementById('password').value
            ){
                const un = localStorage.username;
                // pw box is never cleared
                const pw = document.getElementById('password').value;
                log(`Using found creds for ${un}`);
                dh.cBytes(`LOGIN=${un}~${pw}`);
            }else{
                message('No login method found');
            }
        });
    };

});

// Add the CSS required for toasters to head
(function(){
    // https://stackoverflow.com/a/11833777
    const head = document.head;
    let link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = 'https://cdn.jsdelivr.net/gh/AlexKvazos/VanillaToasts@1.3.0/vanillatoasts.css';
    head.appendChild(link);
})();

// Smitty's Date.toString override breaks some promise code that userscripts use to inject the script. So we have to set 
// @run-at          document-start
// and use to run after the rest of the js/page is loaded
document.addEventListener("DOMContentLoaded", function(event) { 
    r(window, VanillaToasts, ReconnectingWebSocket);
});
