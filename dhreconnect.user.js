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

/*jshint esversion: 6 */
const r = (function(dh, toast, WS){
    'use strict';

    const debug = !! localStorage.dhreconnect_debug;
    const log = function(message){
        if(debug){
            console.log(`DHR> ${message}`);
        }
    };
    log('Loaded, debug mode ON');

    // TODO: Give options, check if chat is even enabled
    let do_toast = false;
    const message = function(text){
        log(`Sending message ${text}`);
        if(do_toast){
                toast.create({
                    title: 'Connection info',
                    message: text,
                    timeout: 5000,
                });
        }else{
            // username, icon, tag, message, isServerMessage
            // but dhFixed uses it as isPM so we just to set it as 0
            // and use tag 5 for the 'SERVER MESSAGE' tag
            dh.addToChatBox('', 0, 5, `[DH Reconnect] ${text}`, 0);
        }
    };

    // close properly without reconnecting
    // HACK: Just pretend this is our first connection to do that
    const give_up = function(){
        log('giving up');
        did_login = false;
        dh.webSocket.close();
    };

    // save the preset used to log in if any
    let login_preset = null;
    // Only let the user know about the connections afer the first
    let did_login = false;

    // override login functions to track method
    // clear the login preset if a PW is used
    const _login = dh.login;
    dh.login = function(username, password, isNewAccount){
        login_preset = null;
        log('Saw PW login, clearing login preset');
        _login.apply(this, arguments);
    };

    // set the preset used to log in
    const _loginPresets = dh.loginPresets;
    dh.loginPresets = function(presetData){
        login_preset = presetData;
        log('Saw preset login, keeping');
        _loginPresets.apply(this, arguments);
    };

    // Override the login return message to apply only if we aren't connected
    // If we are connected, send our preferred message type
    const _manageLoginReturnMessage = dh.manageLoginReturnMessage;
    dh.manageLoginReturnMessage = function(return_message){
        if(did_login){
            message(return_message);
            // we can't recover form an invalid PW or preset
            give_up();
        }else{
            _manageLoginReturnMessage.apply(this, arguments);
        }
    };


    // Override startGame to detect success on login
    const _startGame = dh.startGame;
    dh.startGame = function(){
        did_login = true;
        _startGame.apply(this, arguments);
    };

    // override the websocket setup function to use ours
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

            if (did_login){
                message('Reconnected!');
            } else {
                log('First connection');
            }
        });

        dh.webSocket.addEventListener('message', function(event){
            dh.doCommand(event.data);
        });

        // override Error to queue the LOGIN comand as soon as possible
        // so we can use as many queued events as can can
        dh.webSocket.addEventListener('close', function(event){
            message('Connection lost, reconnecting...');

            if(login_preset){
                log('Found preset');
                dh.cBytes('LOAD_PRESET=' + login_preset);
            }else if(
                document.getElementById('password').value
            ){
                const un = localStorage.username;
                // pw box is never cleared
                const pw = document.getElementById('password').value;
                log(`Using existing user ${un}`);
                dh.cBytes(`LOGIN=${un}~${pw}`);
            }else{
                message('No login method found');
            }

        });
    };

});

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
// and use this hack to run after the rest of the js
document.addEventListener("DOMContentLoaded", function(event) { 
    r(window, VanillaToasts, ReconnectingWebSocket);
});
